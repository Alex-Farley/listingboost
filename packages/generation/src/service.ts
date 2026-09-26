import { ProviderError, type BrandVoice, type ImageInput, type ProviderRegistry, type TemplateRef } from "@listingboost/ai";
import {
  claimJob,
  completeJob,
  failJob,
  findDueQueuedJobs,
  findExpiredLeases,
  getBrandSettings,
  getMedia,
  getProperty,
  listAssets,
  listMedia,
  loadJobContext,
  newGenerationStatements,
  requeueJob,
  setCampaignStatus,
  type AssetRecord,
  type CompletedOutput,
  type JobContext,
  type JobError,
  type OrganisationScope,
  type SqlDatabase,
} from "@listingboost/database";
import {
  buildEnhancementRequest,
  nextVersionNumber,
  selectFinalVersion,
  validateCopyClaims,
  type GenerationCapability,
  type PropertyFacts,
} from "@listingboost/domain";
import { objectKeys, type ObjectStore } from "@listingboost/storage";
import { findTemplate, type TemplateDefinition } from "@listingboost/templates";
import { deriveCampaignStatus } from "./progress";
import { MAX_ATTEMPTS, nextStepAfterFailure } from "./retry-policy";

export interface JobQueue {
  send(jobId: string, delaySeconds?: number): Promise<void>;
}

export type GenerationDeps = {
  db: SqlDatabase;
  storage: ObjectStore;
  queue: JobQueue;
  providers: ProviderRegistry;
  now: () => Date;
};

export class GenerationUnavailableError extends Error {
  constructor() {
    super("generation_unavailable");
  }
}
export class GenerationInProgressError extends Error {
  constructor() {
    super("generation_in_progress");
  }
}

export type RunResult = "missing" | "skipped" | "completed" | "retrying" | "failed";

const LEASE_SECONDS = 10 * 60;
const MAX_REEL_PHOTOS = 10;
const OUTPUT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const SAFE_MESSAGES: Record<string, string> = {
  retries_exhausted: "We couldn't generate this asset after several attempts. You can try again.",
  provider_unavailable: "This asset type isn't available yet.",
};
export const safeErrorMessage = (code: string | null) =>
  code ? (SAFE_MESSAGES[code] ?? "We couldn't generate this asset. You can try again.") : null;

/** Generated content rejected by ListingBoost's own checks; retried like a transient provider failure. */
class ContentRejected extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type ExecutionResult = Omit<CompletedOutput, "provider" | "model" | "promptVersion"> & { provider: string; model: string; promptVersion: string };

async function readAll(stream: ReadableStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function templateOf(asset: { templateId: string; templateVersion: number }): TemplateDefinition {
  const template = findTemplate(asset.templateId, asset.templateVersion);
  if (!template) throw new Error(`Unknown template ${asset.templateId}@${asset.templateVersion}`);
  return template;
}

export class GenerationService {
  constructor(private readonly deps: GenerationDeps) {}

  isAvailable(capability: GenerationCapability): boolean {
    return Boolean((this.deps.providers as Record<string, unknown>)[capability]);
  }

  capabilityOf(asset: { templateId: string; templateVersion: number }): GenerationCapability {
    return templateOf(asset).capability;
  }

  /** Queues generation for every asset that has never been generated. */
  async startCampaign(scope: OrganisationScope, campaignId: string): Promise<{ queued: number; unavailable: string[] }> {
    const assets = await listAssets(this.deps.db, scope, campaignId);
    const pending = assets.filter((a) => a.versions.length === 0);
    const available = pending.filter((a) => this.isAvailable(this.capabilityOf(a)));
    const unavailable = pending.filter((a) => !this.isAvailable(this.capabilityOf(a))).map((a) => a.slotKey);
    if (pending.length > 0 && available.length === 0) throw new GenerationUnavailableError();
    const jobIds = await this.createVersions(scope, campaignId, available);
    await this.refreshStatus(scope, campaignId);
    return { queued: jobIds.length, unavailable };
  }

  /** Creates a new version for one asset; existing versions are never modified. */
  async regenerate(scope: OrganisationScope, campaignId: string, assetId: string): Promise<boolean> {
    const asset = (await listAssets(this.deps.db, scope, campaignId)).find((a) => a.id === assetId);
    if (!asset) return false;
    const latest = asset.versions[0];
    if (latest && (latest.state === "queued" || latest.state === "processing" || latest.state === "completed")) {
      throw new GenerationInProgressError();
    }
    if (!this.isAvailable(this.capabilityOf(asset))) throw new GenerationUnavailableError();
    await this.createVersions(scope, campaignId, [asset]);
    await this.refreshStatus(scope, campaignId);
    return true;
  }

  private async createVersions(scope: OrganisationScope, campaignId: string, assets: AssetRecord[]): Promise<string[]> {
    if (assets.length === 0) return [];
    const now = this.deps.now().toISOString();
    const photos = assets.some((a) => this.capabilityOf(a) === "video_generation") ? await listMedia(this.deps.db, scope, assets[0]!.propertyId) : [];
    const jobIds: string[] = [];
    const statements = assets.flatMap((asset) => {
      const template = templateOf(asset);
      const jobId = crypto.randomUUID();
      jobIds.push(jobId);
      const enhancement = template.capability === "image_enhancement";
      return newGenerationStatements(
        this.deps.db,
        scope,
        {
          versionId: crypto.randomUUID(),
          jobId,
          campaignId,
          assetId: asset.id,
          versionNumber: nextVersionNumber(asset.versions),
          capability: template.capability,
          treatment: enhancement ? "enhancement" : null,
          disclosureLabel: null,
          templateVersion: template.version,
          referenceMediaIds:
            template.capability === "video_generation" ? photos.slice(0, MAX_REEL_PHOTOS).map((p) => p.id) : asset.sourceMediaId ? [asset.sourceMediaId] : [],
          requestJson: JSON.stringify(
            enhancement ? { enhancement: buildEnhancementRequest({ operations: template.config.operations as string[] }) } : { template: template.id },
          ),
          maxAttempts: MAX_ATTEMPTS,
        },
        now,
      );
    });
    await this.deps.db.batch(statements);
    for (const jobId of jobIds) await this.deps.queue.send(jobId);
    return jobIds;
  }

  async refreshStatus(scope: OrganisationScope, campaignId: string): Promise<void> {
    const assets = await listAssets(this.deps.db, scope, campaignId);
    const status = deriveCampaignStatus(assets.map((a) => ({ assetType: a.assetType, available: true, versions: a.versions })));
    await setCampaignStatus(this.deps.db, scope, campaignId, status, this.deps.now().toISOString());
  }

  /** Idempotent: duplicate or late deliveries of the same job are no-ops. */
  async runJob(jobId: string): Promise<RunResult> {
    const job = await loadJobContext(this.deps.db, jobId);
    if (!job) return "missing";
    if (job.versionState !== "queued") return "skipped";
    const now = this.deps.now();
    const lease = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
    if (!(await claimJob(this.deps.db, job, now.toISOString(), lease))) return "skipped";
    const attempts = job.attempts + 1;
    const scope: OrganisationScope = { organisationId: job.organisationId, userId: job.createdBy };

    let result: RunResult;
    try {
      const output = await this.execute(scope, job);
      try {
        await completeJob(this.deps.db, job, output, this.deps.now().toISOString());
      } catch (error) {
        if (output.objectKey) await this.deps.storage.delete(output.objectKey).catch(() => undefined);
        throw error;
      }
      result = "completed";
    } catch (error) {
      result = await this.handleFailure(job, attempts, this.classify(error));
    }
    await this.refreshStatus(scope, job.campaignId);
    return result;
  }

  private classify(error: unknown): JobError {
    if (error instanceof ProviderError) return { code: error.code, message: error.message, transient: error.transient };
    if (error instanceof ContentRejected) return { code: error.code, message: error.message, transient: true };
    return { code: "infrastructure_error", message: error instanceof Error ? error.message : String(error), transient: true };
  }

  private async handleFailure(job: JobContext, attempts: number, error: JobError): Promise<RunResult> {
    const now = this.deps.now();
    console.warn(JSON.stringify({ level: "warn", event: "generation_failed", jobId: job.jobId, attempts, code: error.code, transient: error.transient }));
    const step = nextStepAfterFailure({ transient: error.transient, attempts, maxAttempts: job.maxAttempts });
    if (step.action === "retry") {
      await requeueJob(this.deps.db, job, error, new Date(now.getTime() + step.delaySeconds * 1000).toISOString(), now.toISOString());
      await this.deps.queue.send(job.jobId, step.delaySeconds);
      return "retrying";
    }
    const code = step.code ?? error.code;
    await failJob(this.deps.db, job, code, safeErrorMessage(code)!, error, now.toISOString());
    return "failed";
  }

  private async sourceImage(scope: OrganisationScope, propertyId: string, mediaId: string): Promise<ImageInput> {
    const media = await getMedia(this.deps.db, scope, propertyId, mediaId);
    const object = media ? await this.deps.storage.get(media.objectKey) : null;
    if (!media || !object) throw new ProviderError("source_missing", `Source media ${mediaId} is missing`, false);
    return { bytes: await readAll(object.body), contentType: media.contentType };
  }

  private async context(scope: OrganisationScope, propertyId: string): Promise<{ facts: PropertyFacts; brand: BrandVoice }> {
    const property = await getProperty(this.deps.db, scope, propertyId);
    if (!property) throw new ProviderError("property_missing", "Property is missing", false);
    const settings = await getBrandSettings(this.deps.db, scope);
    const { logoMediaKey, ...voice } = settings;
    const logoObject = logoMediaKey ? await this.deps.storage.get(logoMediaKey) : null;
    const logo = logoObject ? { bytes: await readAll(logoObject.body), contentType: logoObject.contentType } : null;
    return { facts: property.facts, brand: { ...voice, logo } };
  }

  private async execute(scope: OrganisationScope, job: JobContext): Promise<ExecutionResult> {
    const template = templateOf(job);
    const templateRef: TemplateRef = { id: template.id, version: template.version, config: template.config };
    const outputKey = objectKeys.output(job.organisationId, job.versionId);
    const unavailable = () => new ProviderError("provider_unavailable", `No provider for ${job.capability}`, false);

    switch (job.capability) {
      case "image_enhancement": {
        const provider = this.deps.providers.image_enhancement;
        if (!provider) throw unavailable();
        const stored = JSON.parse(job.requestJson) as { enhancement: { operations: string[] } };
        // Rebuilt from the allow-list so a tampered job row cannot smuggle in structural edits.
        const request = buildEnhancementRequest({ operations: stored.enhancement.operations });
        const image = await this.sourceImage(scope, job.propertyId, job.sourceMediaId!);
        const output = await provider.enhance({ image, request });
        return this.storeImage(outputKey, output, provider.info, { request });
      }
      case "text_generation": {
        const provider = this.deps.providers.text_generation;
        if (!provider) throw unavailable();
        const { facts, brand } = await this.context(scope, job.propertyId);
        const config = template.config as { slot: string; description: string; maxLength: number };
        const { text: raw, providerRequestId } = await provider.generateCopy({ ...config, facts, brand });
        const text = raw.trim();
        if (!text || text.length > config.maxLength) throw new ContentRejected("copy_length_invalid", `Copy length ${text.length} outside 1..${config.maxLength}`);
        const check = validateCopyClaims(text, facts);
        if (!check.ok) {
          throw new ContentRejected("copy_truth_violation", `Unsupported claims: ${check.violations.map((v) => v.category).join(", ")}`);
        }
        return {
          kind: "text",
          objectKey: null,
          contentType: "text/plain",
          byteSize: null,
          width: null,
          height: null,
          text,
          ...provider.info,
          providerRequestId: providerRequestId ?? null,
          parametersJson: JSON.stringify({ slot: config.slot, maxLength: config.maxLength, facts, brand: { ...brand, logo: Boolean(brand.logo) } }),
        };
      }
      case "template_render": {
        const provider = this.deps.providers.template_render;
        if (!provider) throw unavailable();
        const { facts, brand } = await this.context(scope, job.propertyId);
        const photo = await this.sourceImage(scope, job.propertyId, job.sourceMediaId!);
        const texts = await this.reviewedCopy(scope, job.campaignId);
        const output = await provider.render({ template: templateRef, photo, facts, brand, texts });
        return this.storeImage(outputKey, output, provider.info, { template: templateRef, texts, facts });
      }
      case "video_generation": {
        const provider = this.deps.providers.video_generation;
        if (!provider) throw unavailable();
        const { facts, brand } = await this.context(scope, job.propertyId);
        const media = (await listMedia(this.deps.db, scope, job.propertyId)).slice(0, MAX_REEL_PHOTOS);
        const photos = await Promise.all(media.map((m) => this.sourceImage(scope, job.propertyId, m.id)));
        const output = await provider.createReel({ template: templateRef, photos, facts, brand });
        if (output.contentType !== "video/mp4" || output.bytes.length === 0) throw new ProviderError("invalid_output", "Provider returned no video", true);
        await this.deps.storage.put(outputKey, output.bytes, { contentType: output.contentType });
        return {
          kind: "media",
          objectKey: outputKey,
          contentType: output.contentType,
          byteSize: output.bytes.length,
          width: output.width,
          height: output.height,
          text: null,
          ...provider.info,
          providerRequestId: output.providerRequestId ?? null,
          parametersJson: JSON.stringify({ template: templateRef, mediaIds: media.map((m) => m.id) }),
        };
      }
      default:
        throw unavailable();
    }
  }

  /** Headline and CTA for graphics: the final approved copy if any, else the latest reviewable version. */
  private async reviewedCopy(scope: OrganisationScope, campaignId: string): Promise<{ headline: string | null; cta: string | null }> {
    const assets = await listAssets(this.deps.db, scope, campaignId);
    const textFor = (slot: string) => {
      const asset = assets.find((a) => a.slotKey === slot);
      if (!asset) return null;
      const chosen = selectFinalVersion(asset.versions) ?? asset.versions.find((v) => v.state === "needs_review") ?? null;
      return chosen?.textContent ?? null;
    };
    return { headline: textFor("copy:headline"), cta: textFor("copy:cta") };
  }

  private async storeImage(
    key: string,
    output: { bytes: Uint8Array; contentType: string; width: number; height: number; providerRequestId?: string },
    info: { provider: string; model: string; promptVersion: string },
    parameters: unknown,
  ): Promise<ExecutionResult> {
    if (!OUTPUT_IMAGE_TYPES.has(output.contentType) || output.bytes.length === 0) {
      throw new ProviderError("invalid_output", `Provider returned ${output.contentType}`, true);
    }
    await this.deps.storage.put(key, output.bytes, { contentType: output.contentType });
    return {
      kind: "media",
      objectKey: key,
      contentType: output.contentType,
      byteSize: output.bytes.length,
      width: output.width,
      height: output.height,
      text: null,
      ...info,
      providerRequestId: output.providerRequestId ?? null,
      parametersJson: JSON.stringify(parameters),
    };
  }

  /** Recovers from lost queue messages and crashed consumers. The database is the source of truth. */
  async sweep(): Promise<{ redispatched: number; reclaimed: number }> {
    const now = this.deps.now();
    let reclaimed = 0;
    for (const jobId of await findExpiredLeases(this.deps.db, now.toISOString())) {
      const job = await loadJobContext(this.deps.db, jobId);
      if (!job) continue;
      const error: JobError = { code: "lease_expired", message: "Worker did not finish before its lease expired", transient: true };
      await this.handleFailure(job, job.attempts, error);
      reclaimed++;
    }
    const due = await findDueQueuedJobs(this.deps.db, now.toISOString());
    for (const jobId of due) await this.deps.queue.send(jobId);
    return { redispatched: due.length, reclaimed };
  }
}

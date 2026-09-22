import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bindings } from "./bindings.server";
import { createListingBoostAuthService } from "./auth.server";
import type { AssetSpecification, GenerationStrategy } from "./generation-provider";
import type { GenerationJobRecord } from "./generation-job";
import { buildGenerationJobIdempotencyKey } from "./campaign-generation";
import { createD1GenerationJobStore } from "./generation-job-store.server";
import { GenerationQueueDispatcher } from "./generation-queue";
import { createCloudflareGenerationQueue } from "./cloudflare-generation-queue.server";

const assetSpecificationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "video"]),
  aspectRatio: z.enum(["1:1", "4:5", "9:16", "16:9", "3:2", "2:3", "4:3", "3:4", "5:4", "21:9"]),
  resolution: z.enum(["480p", "720p", "1080p", "1k", "2k", "4k"]),
  durationSeconds: z.number().positive().optional(),
  references: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["image", "video", "audio"]),
    role: z.enum(["reference", "start", "end", "audio"]),
  })),
  audio: z.object({ enabled: z.boolean() }).optional(),
  outputCount: z.literal(1),
});

const strategySchema = z.object({
  specificationId: z.string().min(1),
  providerKey: z.string().min(1),
  modelKey: z.string().min(1),
  estimatedCostUsd: z.number().nonnegative().optional(),
  maxAttempts: z.number().int().positive(),
});

function db() {
  const value = bindings().DB;
  if (!value) throw new Error("Campaign storage is not available.");
  return value;
}

function generationQueue() {
  const value = bindings().GENERATION_QUEUE;
  if (!value) throw new Error("Generation queue is not configured.");
  return createCloudflareGenerationQueue(value);
}

export type CreateCampaignGenerationJobInput = {
  campaignId: string;
  campaignAssetId: string;
  assetKey: string;
  specification: AssetSpecification;
  strategy: GenerationStrategy;
};

export const createCampaignGenerationJobFn = createServerFn({ method: "POST" })
  .validator(z.object({
    campaignId: z.string().uuid(),
    campaignAssetId: z.string().uuid(),
    assetKey: z.string().min(1).max(100),
    specification: assetSpecificationSchema,
    strategy: strategySchema,
  }))
  .handler(async ({ data }) => {
    const database = db();
    const user = await createListingBoostAuthService(database).getCurrentUser();
    if (!user) throw new Error("Sign in to generate campaign assets.");

    const asset = await database.prepare(
      `SELECT a.id, a.campaign_id
       FROM campaign_assets a
       JOIN campaigns c ON c.id=a.campaign_id
       WHERE a.id=? AND a.campaign_id=? AND c.auth_user_id=?`,
    ).bind(data.campaignAssetId, data.campaignId, user.id).first() as { id?: unknown; campaign_id?: unknown } | null;
    if (!asset || asset.id !== data.campaignAssetId || asset.campaign_id !== data.campaignId) {
      throw new Error("Campaign asset not found.");
    }
    if (data.specification.id !== data.assetKey || data.strategy.specificationId !== data.specification.id) {
      throw new Error("Generation specification does not match the campaign asset.");
    }

    const idempotencyKey = buildGenerationJobIdempotencyKey(data.campaignAssetId, data.assetKey, 0);
    const store = createD1GenerationJobStore(database);
    const existing = await store.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.campaignId !== data.campaignId || existing.campaignAssetId !== data.campaignAssetId) {
        throw new Error("Generation idempotency key is already owned by another campaign asset.");
      }
      if (existing.state !== "pending") {
        return { generationJobId: existing.id, state: existing.state, idempotent: true as const };
      }
    }

    const now = new Date().toISOString();
    const job: GenerationJobRecord = existing ?? {
      id: crypto.randomUUID(),
      campaignId: data.campaignId,
      campaignAssetId: data.campaignAssetId,
      assetKey: data.assetKey,
      state: "pending",
      attempt: 0,
      idempotencyKey,
      specification: data.specification,
      strategy: data.strategy,
      providerKey: data.strategy.providerKey,
      providerModel: data.strategy.modelKey,
      estimatedCostUsd: data.strategy.estimatedCostUsd,
      createdAt: now,
      updatedAt: now,
    };

    const persisted = await new GenerationQueueDispatcher(store, generationQueue()).enqueue({
      job,
      specification: data.specification,
      strategy: data.strategy,
    });

    await database.prepare(
      `UPDATE campaign_assets
       SET asset_key=?, generation_status=?, generation_attempt=?,
           provider_model=?, generation_job_id=?, updated_at=?
       WHERE id=? AND campaign_id=?`,
    ).bind(
      data.assetKey,
      persisted.state,
      persisted.attempt,
      data.strategy.modelKey,
      persisted.id,
      new Date().toISOString(),
      data.campaignAssetId,
      data.campaignId,
    ).run();

    return {
      generationJobId: persisted.id,
      state: persisted.state,
      idempotent: false as const,
    };
  });

import type { AspectRatio, AssetType, AssetVersionState, GenerationCapability } from "@listingboost/domain";
import type { OrganisationScope } from "./scope";
import type { SqlDatabase } from "./sql";

export type JobContext = {
  jobId: string;
  organisationId: string;
  capability: GenerationCapability;
  requestJson: string;
  attempts: number;
  maxAttempts: number;
  versionId: string;
  versionState: AssetVersionState;
  createdBy: string;
  campaignId: string;
  assetId: string;
  assetType: AssetType;
  slotKey: string;
  aspectRatio: AspectRatio | null;
  sourceMediaId: string | null;
  templateId: string;
  templateVersion: number;
  propertyId: string;
};

/**
 * Job IDs arrive from ListingBoost's own queue, not from users, so this lookup
 * is by job ID; the returned organisation ID becomes the scope for all later work.
 */
export async function loadJobContext(db: SqlDatabase, jobId: string): Promise<JobContext | null> {
  const row = await db
    .prepare(
      `SELECT j.id AS job_id, j.organisation_id, j.capability, j.request_json, j.attempts, j.max_attempts,
              v.id AS version_id, v.state, v.created_by, v.campaign_id,
              a.id AS asset_id, a.asset_type, a.slot_key, a.aspect_ratio, a.source_media_id, a.template_id, a.template_version, a.property_id
         FROM generation_jobs j
         JOIN asset_versions v ON v.id = j.version_id AND v.organisation_id = j.organisation_id
         JOIN campaign_assets a ON a.id = v.asset_id AND a.organisation_id = v.organisation_id
        WHERE j.id = ?`,
    )
    .bind(jobId)
    .first<Record<string, string | number | null>>();
  if (!row) return null;
  return {
    jobId: row.job_id as string,
    organisationId: row.organisation_id as string,
    capability: row.capability as GenerationCapability,
    requestJson: row.request_json as string,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    versionId: row.version_id as string,
    versionState: row.state as AssetVersionState,
    createdBy: row.created_by as string,
    campaignId: row.campaign_id as string,
    assetId: row.asset_id as string,
    assetType: row.asset_type as AssetType,
    slotKey: row.slot_key as string,
    aspectRatio: row.aspect_ratio as AspectRatio | null,
    sourceMediaId: row.source_media_id as string | null,
    templateId: row.template_id as string,
    templateVersion: row.template_version as number,
    propertyId: row.property_id as string,
  };
}

/** Compare-and-set claim: only one consumer can move a queued version to processing. */
export async function claimJob(db: SqlDatabase, job: JobContext, now: string, leaseExpiresAt: string): Promise<boolean> {
  const claimed = await db
    .prepare("UPDATE asset_versions SET state = 'processing', updated_at = ? WHERE id = ? AND state = 'queued'")
    .bind(now, job.versionId)
    .run();
  if (claimed.meta.changes !== 1) return false;
  await db
    .prepare("UPDATE generation_jobs SET attempts = attempts + 1, lease_expires_at = ?, updated_at = ? WHERE id = ?")
    .bind(leaseExpiresAt, now, job.jobId)
    .run();
  return true;
}

export type CompletedOutput = {
  kind: "media" | "text";
  objectKey: string | null;
  contentType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  text: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  providerRequestId: string | null;
  parametersJson: string;
};

export async function completeJob(db: SqlDatabase, job: JobContext, output: CompletedOutput, now: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO generation_outputs (id, organisation_id, job_id, kind, object_key, content_type, byte_size, text_content, provider, model,
           provider_request_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        job.organisationId,
        job.jobId,
        output.kind,
        output.objectKey,
        output.contentType,
        output.byteSize,
        output.text,
        output.provider,
        output.model,
        output.providerRequestId,
        now,
      ),
    db
      .prepare(
        `UPDATE asset_versions SET state = 'completed', text_content = ?, output_object_key = ?, output_content_type = ?, output_byte_size = ?,
           output_width = ?, output_height = ?, provider = ?, model = ?, prompt_version = ?, parameters_json = ?, error_code = NULL,
           error_message = NULL, completed_at = ?, updated_at = ?
         WHERE id = ? AND state = 'processing'`,
      )
      .bind(
        output.text,
        output.objectKey,
        output.contentType,
        output.byteSize,
        output.width,
        output.height,
        output.provider,
        output.model,
        output.promptVersion,
        output.parametersJson,
        now,
        now,
        job.versionId,
      ),
    db.prepare("UPDATE asset_versions SET state = 'needs_review', updated_at = ? WHERE id = ? AND state = 'completed'").bind(now, job.versionId),
    db.prepare("UPDATE generation_jobs SET lease_expires_at = NULL, updated_at = ? WHERE id = ?").bind(now, job.jobId),
  ]);
}

export type JobError = { code: string; message: string; transient: boolean };

export async function requeueJob(db: SqlDatabase, job: JobContext, error: JobError, nextRunAt: string, now: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE asset_versions SET state = 'queued', updated_at = ? WHERE id = ? AND state = 'processing'").bind(now, job.versionId),
    db
      .prepare(
        `UPDATE generation_jobs SET next_run_at = ?, lease_expires_at = NULL, last_error_code = ?, last_error_message = ?,
           last_error_transient = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(nextRunAt, error.code, error.message.slice(0, 1000), error.transient ? 1 : 0, now, job.jobId),
  ]);
}

export async function failJob(db: SqlDatabase, job: JobContext, versionErrorCode: string, versionMessage: string, error: JobError, now: string): Promise<void> {
  await db.batch([
    db
      .prepare("UPDATE asset_versions SET state = 'failed', error_code = ?, error_message = ?, updated_at = ? WHERE id = ? AND state = 'processing'")
      .bind(versionErrorCode, versionMessage, now, job.versionId),
    db
      .prepare(
        `UPDATE generation_jobs SET lease_expires_at = NULL, last_error_code = ?, last_error_message = ?, last_error_transient = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(error.code, error.message.slice(0, 1000), error.transient ? 1 : 0, now, job.jobId),
  ]);
}

/** Jobs that are due but may have lost their queue message. */
export async function findDueQueuedJobs(db: SqlDatabase, now: string, limit = 100): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT j.id FROM generation_jobs j JOIN asset_versions v ON v.id = j.version_id
        WHERE v.state = 'queued' AND j.next_run_at <= ? ORDER BY j.next_run_at LIMIT ?`,
    )
    .bind(now, limit)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/** Processing jobs whose consumer died: lease expired. */
export async function findExpiredLeases(db: SqlDatabase, now: string, limit = 100): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT j.id FROM generation_jobs j JOIN asset_versions v ON v.id = j.version_id
        WHERE v.state = 'processing' AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at < ? LIMIT ?`,
    )
    .bind(now, limit)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

export type BrandSettingsRecord = {
  agencyName: string | null;
  toneOfVoice: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  logoMediaKey: string | null;
};

export async function getBrandSettings(db: SqlDatabase, scope: OrganisationScope): Promise<BrandSettingsRecord> {
  const row = await db
    .prepare(
      `SELECT agency_name, tone_of_voice, contact_phone, contact_email, website, primary_colour, secondary_colour, heading_font, body_font,
              logo_media_key
         FROM brand_settings WHERE organisation_id = ?`,
    )
    .bind(scope.organisationId)
    .first<Record<string, string | null>>();
  return {
    agencyName: row?.agency_name ?? null,
    toneOfVoice: row?.tone_of_voice ?? null,
    contactPhone: row?.contact_phone ?? null,
    contactEmail: row?.contact_email ?? null,
    website: row?.website ?? null,
    primaryColour: row?.primary_colour ?? null,
    secondaryColour: row?.secondary_colour ?? null,
    headingFont: row?.heading_font ?? null,
    bodyFont: row?.body_font ?? null,
    logoMediaKey: row?.logo_media_key ?? null,
  };
}

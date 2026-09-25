import type { AspectRatio, AssetType, AssetVersionState, CampaignStatus, GenerationCapability, ImageTreatment } from "@listingboost/domain";
import { auditStatement } from "./audit";
import type { OrganisationScope } from "./scope";
import type { SqlDatabase, SqlStatement } from "./sql";

export type CampaignRecord = { id: string; propertyId: string; name: string; status: CampaignStatus; createdAt: string; updatedAt: string };

export type NewAsset = {
  slotKey: string;
  assetType: AssetType;
  aspectRatio: AspectRatio | null;
  sourceMediaId: string | null;
  templateId: string;
  templateVersion: number;
  sortOrder: number;
};

export type VersionRecord = {
  id: string;
  assetId: string;
  versionNumber: number;
  origin: "generation" | "manual_edit";
  state: AssetVersionState;
  treatment: ImageTreatment | null;
  disclosureLabel: string | null;
  textContent: string | null;
  outputObjectKey: string | null;
  outputContentType: string | null;
  outputByteSize: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  approvedAt: string | null;
};

export type AssetRecord = NewAsset & { id: string; campaignId: string; propertyId: string; versions: VersionRecord[] };

type CampaignRow = { id: string; property_id: string; name: string; status: CampaignStatus; created_at: string; updated_at: string };
const toCampaign = (r: CampaignRow): CampaignRecord => ({
  id: r.id,
  propertyId: r.property_id,
  name: r.name,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function createCampaign(
  db: SqlDatabase,
  scope: OrganisationScope,
  input: { propertyId: string; name: string; assets: NewAsset[] },
  now: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO campaigns (id, organisation_id, property_id, name, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
      )
      .bind(id, scope.organisationId, input.propertyId, input.name, scope.userId, now, now),
    ...input.assets.map((a) =>
      db
        .prepare(
          `INSERT INTO campaign_assets (id, organisation_id, campaign_id, property_id, asset_type, slot_key, aspect_ratio, source_media_id,
             template_id, template_version, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          scope.organisationId,
          id,
          input.propertyId,
          a.assetType,
          a.slotKey,
          a.aspectRatio,
          a.sourceMediaId,
          a.templateId,
          a.templateVersion,
          a.sortOrder,
          now,
        ),
    ),
    auditStatement(db, scope, { action: "campaign.created", subjectType: "campaign", subjectId: id, now }),
  ]);
  return id;
}

export async function getCampaign(db: SqlDatabase, scope: OrganisationScope, id: string): Promise<CampaignRecord | null> {
  const row = await db
    .prepare("SELECT id, property_id, name, status, created_at, updated_at FROM campaigns WHERE id = ? AND organisation_id = ?")
    .bind(id, scope.organisationId)
    .first<CampaignRow>();
  return row ? toCampaign(row) : null;
}

export async function listCampaignsForProperty(db: SqlDatabase, scope: OrganisationScope, propertyId: string): Promise<CampaignRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT id, property_id, name, status, created_at, updated_at FROM campaigns
        WHERE property_id = ? AND organisation_id = ? AND archived_at IS NULL ORDER BY created_at DESC, rowid DESC`,
    )
    .bind(propertyId, scope.organisationId)
    .all<CampaignRow>();
  return results.map(toCampaign);
}

export async function setCampaignStatus(db: SqlDatabase, scope: OrganisationScope, id: string, status: CampaignStatus, now: string): Promise<void> {
  await db
    .prepare("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ? AND organisation_id = ? AND status IS NOT ?")
    .bind(status, now, id, scope.organisationId, status)
    .run();
}

type AssetRow = {
  id: string;
  campaign_id: string;
  property_id: string;
  asset_type: AssetType;
  slot_key: string;
  aspect_ratio: AspectRatio | null;
  source_media_id: string | null;
  template_id: string;
  template_version: number;
  sort_order: number;
};

type VersionRow = {
  id: string;
  asset_id: string;
  version_number: number;
  origin: "generation" | "manual_edit";
  state: AssetVersionState;
  treatment: ImageTreatment | null;
  disclosure_label: string | null;
  text_content: string | null;
  output_object_key: string | null;
  output_content_type: string | null;
  output_byte_size: number | null;
  output_width: number | null;
  output_height: number | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  approved_at: string | null;
};

const VERSION_COLUMNS = `id, asset_id, version_number, origin, state, treatment, disclosure_label, text_content, output_object_key,
  output_content_type, output_byte_size, output_width, output_height, error_code, created_at, updated_at, completed_at, approved_at`;

export const toVersion = (r: VersionRow): VersionRecord => ({
  id: r.id,
  assetId: r.asset_id,
  versionNumber: r.version_number,
  origin: r.origin,
  state: r.state,
  treatment: r.treatment,
  disclosureLabel: r.disclosure_label,
  textContent: r.text_content,
  outputObjectKey: r.output_object_key,
  outputContentType: r.output_content_type,
  outputByteSize: r.output_byte_size,
  outputWidth: r.output_width,
  outputHeight: r.output_height,
  errorCode: r.error_code,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
  approvedAt: r.approved_at,
});

export async function listAssets(db: SqlDatabase, scope: OrganisationScope, campaignId: string): Promise<AssetRecord[]> {
  const [assets, versions] = await Promise.all([
    db
      .prepare(
        `SELECT id, campaign_id, property_id, asset_type, slot_key, aspect_ratio, source_media_id, template_id, template_version, sort_order
           FROM campaign_assets WHERE campaign_id = ? AND organisation_id = ? AND discarded_at IS NULL ORDER BY sort_order`,
      )
      .bind(campaignId, scope.organisationId)
      .all<AssetRow>(),
    db
      .prepare(`SELECT ${VERSION_COLUMNS} FROM asset_versions WHERE campaign_id = ? AND organisation_id = ? ORDER BY version_number DESC`)
      .bind(campaignId, scope.organisationId)
      .all<VersionRow>(),
  ]);
  const byAsset = new Map<string, VersionRecord[]>();
  for (const v of versions.results) {
    const list = byAsset.get(v.asset_id) ?? [];
    list.push(toVersion(v));
    byAsset.set(v.asset_id, list);
  }
  return assets.results.map((a) => ({
    id: a.id,
    campaignId: a.campaign_id,
    propertyId: a.property_id,
    assetType: a.asset_type,
    slotKey: a.slot_key,
    aspectRatio: a.aspect_ratio,
    sourceMediaId: a.source_media_id,
    templateId: a.template_id,
    templateVersion: a.template_version,
    sortOrder: a.sort_order,
    versions: byAsset.get(a.id) ?? [],
  }));
}

export type NewGenerationVersion = {
  versionId: string;
  jobId: string;
  campaignId: string;
  assetId: string;
  versionNumber: number;
  capability: GenerationCapability;
  treatment: ImageTreatment | null;
  disclosureLabel: string | null;
  templateVersion: number;
  referenceMediaIds: string[];
  requestJson: string;
  maxAttempts: number;
};

/** Statements creating a queued version and its job; callers batch them atomically. */
export function newGenerationStatements(db: SqlDatabase, scope: OrganisationScope, input: NewGenerationVersion, now: string): SqlStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO asset_versions (id, organisation_id, campaign_id, asset_id, version_number, origin, state, treatment, disclosure_label,
           template_version, reference_media_ids_json, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'generation', 'queued', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.versionId,
        scope.organisationId,
        input.campaignId,
        input.assetId,
        input.versionNumber,
        input.treatment,
        input.disclosureLabel,
        input.templateVersion,
        JSON.stringify(input.referenceMediaIds),
        scope.userId,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO generation_jobs (id, organisation_id, version_id, capability, request_json, attempts, max_attempts, next_run_at,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .bind(input.jobId, scope.organisationId, input.versionId, input.capability, input.requestJson, input.maxAttempts, now, now, now),
  ];
}

export async function getVersionById(db: SqlDatabase, scope: OrganisationScope, versionId: string): Promise<VersionRecord | null> {
  const row = await db
    .prepare(`SELECT ${VERSION_COLUMNS} FROM asset_versions WHERE id = ? AND organisation_id = ?`)
    .bind(versionId, scope.organisationId)
    .first<VersionRow>();
  return row ? toVersion(row) : null;
}

export type DownloadableOutput = {
  objectKey: string;
  contentType: string;
  versionNumber: number;
  slotKey: string;
  assetType: AssetType;
  propertyTitle: string;
};

/**
 * Unscoped by design: only called after an HMAC-signed URL for this exact
 * version ID has been verified. The signature was issued after a scoped lookup.
 */
export async function getOutputForSignedDownload(db: SqlDatabase, versionId: string): Promise<DownloadableOutput | null> {
  const row = await db
    .prepare(
      `SELECT v.output_object_key, v.output_content_type, v.version_number, a.slot_key, a.asset_type, p.title
         FROM asset_versions v
         JOIN campaign_assets a ON a.id = v.asset_id AND a.organisation_id = v.organisation_id
         JOIN properties p ON p.id = a.property_id AND p.organisation_id = a.organisation_id
        WHERE v.id = ? AND v.output_object_key IS NOT NULL`,
    )
    .bind(versionId)
    .first<{ output_object_key: string; output_content_type: string; version_number: number; slot_key: string; asset_type: AssetType; title: string }>();
  return row
    ? {
        objectKey: row.output_object_key,
        contentType: row.output_content_type,
        versionNumber: row.version_number,
        slotKey: row.slot_key,
        assetType: row.asset_type,
        propertyTitle: row.title,
      }
    : null;
}

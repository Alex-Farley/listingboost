import type { SqliteD1 } from "./sqlite-d1";

const now = () => new Date().toISOString();
let seq = 0;
export const id = (prefix: string) => `${prefix}_${++seq}_${crypto.randomUUID().slice(0, 8)}`;

export type Tenant = { orgId: string; userId: string };

export function insertTenant(db: SqliteD1, name = "Agency"): Tenant {
  const orgId = id("org");
  const userId = id("usr");
  db.raw.run("INSERT INTO organisations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", [orgId, name, now(), now()]);
  db.raw.run(
    "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "Agent", "pbkdf2$x", now(), now()],
  );
  db.raw.run("INSERT INTO organisation_members (organisation_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", [orgId, userId, now()]);
  return { orgId, userId };
}

export function insertProperty(db: SqliteD1, t: Tenant): string {
  const propertyId = id("prop");
  db.raw.run(
    `INSERT INTO properties (id, organisation_id, title, address_line1, postcode, property_type, key_features_json, description,
       fact_provenance_json, created_by, created_at, updated_at)
     VALUES (?, ?, 'Home', '1 High St', 'AL5 2AB', 'detached', '[]', '', '{}', ?, ?, ?)`,
    [propertyId, t.orgId, t.userId, now(), now()],
  );
  return propertyId;
}

export function insertMedia(db: SqliteD1, t: Tenant, propertyId: string, position = 0): string {
  const mediaId = id("med");
  db.raw.run(
    `INSERT INTO property_media (id, organisation_id, property_id, object_key, original_filename, content_type, byte_size, width, height,
       sha256, position, is_primary, created_by, created_at)
     VALUES (?, ?, ?, ?, 'a.jpg', 'image/jpeg', 100, 800, 600, 'abc', ?, 0, ?, ?)`,
    [mediaId, t.orgId, propertyId, `org/${t.orgId}/source/${mediaId}`, position, t.userId, now()],
  );
  return mediaId;
}

export function insertCampaign(db: SqliteD1, t: Tenant, propertyId: string): string {
  const campaignId = id("cmp");
  db.raw.run(
    `INSERT INTO campaigns (id, organisation_id, property_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'Launch', 'draft', ?, ?, ?)`,
    [campaignId, t.orgId, propertyId, t.userId, now(), now()],
  );
  return campaignId;
}

export function insertAsset(
  db: SqliteD1,
  t: Tenant,
  campaignId: string,
  propertyId: string,
  opts: { sourceMediaId?: string | null; assetType?: string; slotKey?: string } = {},
): string {
  const assetId = id("ast");
  db.raw.run(
    `INSERT INTO campaign_assets (id, organisation_id, campaign_id, property_id, asset_type, slot_key, aspect_ratio, source_media_id,
       sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '1:1', ?, 0, ?)`,
    [assetId, t.orgId, campaignId, propertyId, opts.assetType ?? "enhanced_photo", opts.slotKey ?? assetId, opts.sourceMediaId ?? null, now()],
  );
  return assetId;
}

export function insertVersion(
  db: SqliteD1,
  t: Tenant,
  campaignId: string,
  assetId: string,
  opts: { state?: string; versionNumber?: number; treatment?: string | null; disclosureLabel?: string | null; approvedAt?: string | null } = {},
): string {
  const versionId = id("ver");
  db.raw.run(
    `INSERT INTO asset_versions (id, organisation_id, campaign_id, asset_id, version_number, origin, state, treatment, disclosure_label,
       approved_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'generation', ?, ?, ?, ?, ?, ?, ?)`,
    [
      versionId,
      t.orgId,
      campaignId,
      assetId,
      opts.versionNumber ?? 1,
      opts.state ?? "queued",
      opts.treatment === undefined ? "enhancement" : opts.treatment,
      opts.disclosureLabel ?? null,
      opts.approvedAt ?? null,
      t.userId,
      now(),
      now(),
    ],
  );
  return versionId;
}

import type { OrganisationScope } from "./scope";
import type { SqlDatabase } from "./sql";

type Target = { campaignId: string; assetId: string; versionId: string };

const auditIfApplied = (db: SqlDatabase, scope: OrganisationScope, action: string, t: Target, state: string, now: string) =>
  db
    .prepare(
      `INSERT INTO audit_events (id, organisation_id, actor_user_id, action, subject_type, subject_id, metadata_json, created_at)
       SELECT ?, ?, ?, ?, 'asset_version', id, json_object('assetId', asset_id, 'campaignId', campaign_id), ?
         FROM asset_versions WHERE id = ? AND organisation_id = ? AND state = ? AND updated_at = ?`,
    )
    .bind(crypto.randomUUID(), scope.organisationId, scope.userId, action, now, t.versionId, scope.organisationId, state, now);

/** Moves a version in review to approved/rejected. Returns false if it was not in review (nothing changes). */
export async function decideVersion(
  db: SqlDatabase,
  scope: OrganisationScope,
  target: Target,
  decision: "approved" | "rejected",
  now: string,
): Promise<boolean> {
  const approval = decision === "approved";
  const [update] = (await db.batch([
    db
      .prepare(
        `UPDATE asset_versions
            SET state = ?, approved_at = ?, approved_by = ?, updated_at = ?
          WHERE id = ? AND asset_id = ? AND campaign_id = ? AND organisation_id = ? AND state = 'needs_review'`,
      )
      .bind(
        decision,
        approval ? now : null,
        approval ? scope.userId : null,
        now,
        target.versionId,
        target.assetId,
        target.campaignId,
        scope.organisationId,
      ),
    auditIfApplied(db, scope, `asset_version.${decision}`, target, decision, now),
  ])) as Array<{ meta: { changes: number } }>;
  return (update?.meta.changes ?? 0) === 1;
}

export async function createManualTextVersion(
  db: SqlDatabase,
  scope: OrganisationScope,
  input: { campaignId: string; assetId: string; versionNumber: number; templateVersion: number; text: string },
  now: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO asset_versions (id, organisation_id, campaign_id, asset_id, version_number, origin, state, text_content, template_version,
           created_by, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, 'manual_edit', 'needs_review', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, scope.organisationId, input.campaignId, input.assetId, input.versionNumber, input.text, input.templateVersion, scope.userId, now, now, now),
    db
      .prepare(
        `INSERT INTO audit_events (id, organisation_id, actor_user_id, action, subject_type, subject_id, metadata_json, created_at)
         VALUES (?, ?, ?, 'asset_version.edited', 'asset_version', ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), scope.organisationId, scope.userId, id, JSON.stringify({ assetId: input.assetId }), now),
  ]);
  return id;
}

export async function discardAsset(db: SqlDatabase, scope: OrganisationScope, campaignId: string, assetId: string, now: string): Promise<boolean> {
  const [update] = (await db.batch([
    db
      .prepare("UPDATE campaign_assets SET discarded_at = ? WHERE id = ? AND campaign_id = ? AND organisation_id = ? AND discarded_at IS NULL")
      .bind(now, assetId, campaignId, scope.organisationId),
    db
      .prepare(
        `INSERT INTO audit_events (id, organisation_id, actor_user_id, action, subject_type, subject_id, metadata_json, created_at)
         SELECT ?, ?, ?, 'campaign_asset.discarded', 'campaign_asset', id, '{}', ? FROM campaign_assets
          WHERE id = ? AND organisation_id = ? AND discarded_at = ?`,
      )
      .bind(crypto.randomUUID(), scope.organisationId, scope.userId, now, assetId, scope.organisationId, now),
  ])) as Array<{ meta: { changes: number } }>;
  return (update?.meta.changes ?? 0) === 1;
}

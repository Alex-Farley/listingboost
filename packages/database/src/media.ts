import type { OrganisationScope } from "./scope";
import type { SqlDatabase } from "./sql";

export type MediaRecord = {
  id: string;
  propertyId: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  position: number;
  isPrimary: boolean;
  createdAt: string;
};

type MediaRow = {
  id: string;
  property_id: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  position: number;
  is_primary: number;
  created_at: string;
};

const COLUMNS = "id, property_id, object_key, original_filename, content_type, byte_size, width, height, sha256, position, is_primary, created_at";

const toRecord = (r: MediaRow): MediaRecord => ({
  id: r.id,
  propertyId: r.property_id,
  objectKey: r.object_key,
  originalFilename: r.original_filename,
  contentType: r.content_type,
  byteSize: r.byte_size,
  width: r.width,
  height: r.height,
  sha256: r.sha256,
  position: r.position,
  isPrimary: r.is_primary === 1,
  createdAt: r.created_at,
});

export class MediaInUseError extends Error {
  constructor() {
    super("media_in_use");
  }
}

export type NewMedia = {
  id: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

export async function listMedia(db: SqlDatabase, scope: OrganisationScope, propertyId: string): Promise<MediaRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM property_media WHERE property_id = ? AND organisation_id = ? ORDER BY position, created_at`)
    .bind(propertyId, scope.organisationId)
    .all<MediaRow>();
  return results.map(toRecord);
}

export async function getMedia(db: SqlDatabase, scope: OrganisationScope, propertyId: string, mediaId: string): Promise<MediaRecord | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM property_media WHERE id = ? AND property_id = ? AND organisation_id = ?`)
    .bind(mediaId, propertyId, scope.organisationId)
    .first<MediaRow>();
  return row ? toRecord(row) : null;
}

/** Appends a photo; the first photo of a property becomes primary. Caller has verified the property is in scope. */
export async function addMedia(db: SqlDatabase, scope: OrganisationScope, propertyId: string, media: NewMedia, now: string): Promise<MediaRecord> {
  await db
    .prepare(
      `INSERT INTO property_media (id, organisation_id, property_id, object_key, original_filename, content_type, byte_size, width,
         height, sha256, position, is_primary, created_by, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         COALESCE((SELECT MAX(position) + 1 FROM property_media WHERE property_id = ? AND organisation_id = ?), 0),
         NOT EXISTS (SELECT 1 FROM property_media WHERE property_id = ? AND organisation_id = ? AND is_primary = 1),
         ?, ?`,
    )
    .bind(
      media.id,
      scope.organisationId,
      propertyId,
      media.objectKey,
      media.originalFilename,
      media.contentType,
      media.byteSize,
      media.width,
      media.height,
      media.sha256,
      propertyId,
      scope.organisationId,
      propertyId,
      scope.organisationId,
      scope.userId,
      now,
    )
    .run();
  return (await getMedia(db, scope, propertyId, media.id))!;
}

async function assertNotInUse(db: SqlDatabase, scope: OrganisationScope, mediaId: string): Promise<void> {
  const used = await db
    .prepare("SELECT 1 AS used FROM campaign_assets WHERE source_media_id = ? AND organisation_id = ? LIMIT 1")
    .bind(mediaId, scope.organisationId)
    .first<{ used: number }>();
  if (used) throw new MediaInUseError();
}

const compactPositions = (db: SqlDatabase, scope: OrganisationScope, propertyId: string) =>
  db
    .prepare(
      `UPDATE property_media SET position = (
         SELECT COUNT(*) FROM property_media p2
          WHERE p2.property_id = property_media.property_id
            AND (p2.position < property_media.position OR (p2.position = property_media.position AND p2.created_at < property_media.created_at)))
       WHERE property_id = ? AND organisation_id = ?`,
    )
    .bind(propertyId, scope.organisationId);

export async function deleteMedia(db: SqlDatabase, scope: OrganisationScope, media: MediaRecord): Promise<void> {
  await assertNotInUse(db, scope, media.id);
  await db.batch([
    db.prepare("DELETE FROM property_media WHERE id = ? AND organisation_id = ?").bind(media.id, scope.organisationId),
    compactPositions(db, scope, media.propertyId),
    db
      .prepare(
        `UPDATE property_media SET is_primary = 1
          WHERE id = (SELECT id FROM property_media WHERE property_id = ? AND organisation_id = ? ORDER BY position LIMIT 1)
            AND NOT EXISTS (SELECT 1 FROM property_media WHERE property_id = ? AND organisation_id = ? AND is_primary = 1)`,
      )
      .bind(media.propertyId, scope.organisationId, media.propertyId, scope.organisationId),
  ]);
}

/** Swaps the image in a slot: the new row takes the old one's position and primary flag. */
export async function replaceMedia(
  db: SqlDatabase,
  scope: OrganisationScope,
  old: MediaRecord,
  media: NewMedia,
  now: string,
): Promise<MediaRecord> {
  await assertNotInUse(db, scope, old.id);
  await db.batch([
    db.prepare("DELETE FROM property_media WHERE id = ? AND organisation_id = ?").bind(old.id, scope.organisationId),
    db
      .prepare(
        `INSERT INTO property_media (id, organisation_id, property_id, object_key, original_filename, content_type, byte_size, width,
           height, sha256, position, is_primary, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        media.id,
        scope.organisationId,
        old.propertyId,
        media.objectKey,
        media.originalFilename,
        media.contentType,
        media.byteSize,
        media.width,
        media.height,
        media.sha256,
        old.position,
        old.isPrimary ? 1 : 0,
        scope.userId,
        now,
      ),
  ]);
  return (await getMedia(db, scope, old.propertyId, media.id))!;
}

export async function reorderMedia(db: SqlDatabase, scope: OrganisationScope, propertyId: string, orderedIds: string[]): Promise<void> {
  await db.batch(
    orderedIds.map((id, position) =>
      db
        .prepare("UPDATE property_media SET position = ? WHERE id = ? AND property_id = ? AND organisation_id = ?")
        .bind(position, id, propertyId, scope.organisationId),
    ),
  );
}

export async function setPrimaryMedia(db: SqlDatabase, scope: OrganisationScope, propertyId: string, mediaId: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE property_media SET is_primary = 0 WHERE property_id = ? AND organisation_id = ?").bind(propertyId, scope.organisationId),
    db
      .prepare("UPDATE property_media SET is_primary = 1 WHERE id = ? AND property_id = ? AND organisation_id = ?")
      .bind(mediaId, propertyId, scope.organisationId),
  ]);
}

export type DownloadableSourceMedia = { objectKey: string; contentType: string; position: number; propertyTitle: string };

/**
 * Unscoped by design: only called after an HMAC-signed URL for this exact media
 * ID has been verified. The signature was issued after a scoped lookup.
 */
export async function getSourceMediaForSignedDownload(db: SqlDatabase, mediaId: string): Promise<DownloadableSourceMedia | null> {
  const row = await db
    .prepare(
      `SELECT m.object_key, m.content_type, m.position, p.title
         FROM property_media m JOIN properties p ON p.id = m.property_id AND p.organisation_id = m.organisation_id
        WHERE m.id = ?`,
    )
    .bind(mediaId)
    .first<{ object_key: string; content_type: string; position: number; title: string }>();
  return row ? { objectKey: row.object_key, contentType: row.content_type, position: row.position, propertyTitle: row.title } : null;
}

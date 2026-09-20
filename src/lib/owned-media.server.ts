import { bindings } from "./bindings.server";
import { createListingBoostAuthService } from "./auth.server";
import { createR2MediaStore } from "./r2-media.server";
import type { MediaKind } from "./media.server";

export async function requireOwnedMediaUserId() {
  const database = bindings().DB;
  if (!database) throw new Error("Owned media storage is not available.");
  const user = await createListingBoostAuthService(database).getCurrentUser();
  if (!user) throw new Error("Sign in to manage media.");
  return user.id;
}

export async function getOwnedSourceImage(mediaId: string, userId: string) {
  const bucket = bindings().STORAGE;
  const database = bindings().DB;
  if (!bucket || !database) return null;

  const row = await database.prepare(
    "SELECT id,object_key,kind FROM campaign_media WHERE id=? AND owner_user_id=? AND kind='image'",
  ).bind(mediaId, userId).first() as { id?: unknown; object_key?: unknown; kind?: unknown } | null;
  if (!row || row.id !== mediaId || row.kind !== "image" || typeof row.object_key !== "string") {
    return null;
  }

  const object = await bucket.head(row.object_key);
  if (!object) return null;
  return { id: mediaId, type: "image" as const };
}

export async function storeOwnedImage(file: File) {
  const userId = await requireOwnedMediaUserId();
  const bucket = bindings().STORAGE;
  const database = bindings().DB;
  if (!bucket || !database) throw new Error("Owned media storage is not available.");

  const id = crypto.randomUUID();
  const kind: MediaKind = "image";
  const objectKey = `campaign-media/${kind}/${id}`;
  const contentType = file.type || "application/octet-stream";
  const bytes = await file.arrayBuffer();

  await createR2MediaStore(bucket).put({ id, objectKey, kind, body: bytes, contentType, byteSize: file.size });
  try {
    await database.prepare(
      "INSERT INTO campaign_media (id,kind,object_key,content_type,byte_size,owner_user_id) VALUES (?,?,?,?,?,?)",
    ).bind(id, kind, objectKey, contentType, file.size, userId).run();
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    throw error;
  }

  return { id, type: kind, url: `/api/media/download?id=${encodeURIComponent(id)}&type=${kind}`, objectKey };
}

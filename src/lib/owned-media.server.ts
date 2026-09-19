import { bindings } from "./bindings.server";
import { createLegacyFnfAuthService } from "./auth.server";
import { createR2MediaStore } from "./r2-media.server";
import type { MediaKind } from "./media.server";

export async function requireOwnedMediaUserId() {
  const user = await createLegacyFnfAuthService().getCurrentUser();
  if (!user) throw new Error("Sign in to manage media.");
  return user.id;
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
  await database.prepare(
    "INSERT INTO campaign_media (id,kind,object_key,content_type,byte_size,owner_user_id) VALUES (?,?,?,?,?,?)",
  ).bind(id, kind, objectKey, contentType, file.size, userId).run();

  return { id, type: kind, url: `/api/media/download?id=${encodeURIComponent(id)}&type=${kind}`, objectKey };
}

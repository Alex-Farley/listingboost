import {
  addMedia,
  deleteMedia,
  getMedia,
  getProperty,
  listMedia,
  MediaInUseError,
  reorderMedia,
  replaceMedia,
  setPrimaryMedia,
  type MediaRecord,
  type NewMedia,
  type OrganisationScope,
} from "@listingboost/database";
import { MAX_UPLOAD_BYTES, objectKeys, UploadRejectedError, validateImageUpload } from "@listingboost/storage";
import { z } from "zod";
import { sha256Hex } from "../auth/crypto";
import { requireSession } from "../auth/session";
import type { AppContext } from "../context";
import { HttpError, json, noContent, notFound, parseBody } from "../http";
import { sourcePhotoFilename } from "../media/filenames";
import { signFileUrl, type Disposition } from "../media/signed-urls";
import type { Router } from "../router";
import { scopeOf } from "./properties";

const MULTIPART_OVERHEAD = 64 * 1024;

async function presentMedia(ctx: AppContext, propertyTitle: string, media: MediaRecord) {
  const { url } = await signFileUrl(ctx.config.mediaSigningSecret, { kind: "source", id: media.id, disposition: "inline" }, ctx.now());
  return {
    id: media.id,
    contentType: media.contentType,
    width: media.width,
    height: media.height,
    byteSize: media.byteSize,
    position: media.position,
    isPrimary: media.isPrimary,
    filename: sourcePhotoFilename(propertyTitle, media.position, media.contentType),
    originalFilename: media.originalFilename,
    createdAt: media.createdAt,
    url,
  };
}

async function propertyInScope(ctx: AppContext, scope: OrganisationScope, propertyId: string) {
  const property = await getProperty(ctx.db, scope, propertyId);
  if (!property) throw notFound();
  return property;
}

/** Reads, validates and stores one uploaded photo. Nothing is written when validation fails. */
async function receivePhoto(request: Request, ctx: AppContext, scope: OrganisationScope): Promise<NewMedia> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(415, "unsupported_media_type", "Upload photos as multipart/form-data.");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "invalid_upload", "The upload could not be read.");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "invalid_upload", "Choose a photo to upload.", { file: "Required" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let validated;
  try {
    validated = validateImageUpload({ bytes, filename: file.name, declaredType: file.type });
  } catch (error) {
    if (error instanceof UploadRejectedError) throw new HttpError(400, error.code, error.message, { file: error.message });
    throw error;
  }
  const id = crypto.randomUUID();
  const objectKey = objectKeys.source(scope.organisationId, id);
  await ctx.storage.put(objectKey, bytes, { contentType: validated.contentType });
  return {
    id,
    objectKey,
    originalFilename: file.name.slice(0, 255),
    contentType: validated.contentType,
    byteSize: bytes.length,
    width: validated.width,
    height: validated.height,
    sha256: await sha256Hex(bytes),
  };
}

/** Removes a just-written object if the database write that should reference it fails. */
async function withObjectRollback<T>(ctx: AppContext, objectKey: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    await ctx.storage.delete(objectKey).catch(() => undefined);
    throw error;
  }
}

function assertUploadSize(request: Request) {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD) throw new HttpError(413, "file_too_large", "Photos must be 25 MB or smaller.");
}

const inUse = () => new HttpError(409, "media_in_use", "This photo is used by a campaign and can't be removed.");

export function registerMediaRoutes(router: Router<AppContext>): void {
  router.on("POST", "/api/properties/:id/media", async (request, params, ctx) => {
    assertUploadSize(request);
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await propertyInScope(ctx, scope, params.id!);
    const media = await receivePhoto(request, ctx, scope);
    const record = await withObjectRollback(ctx, media.objectKey, () => addMedia(ctx.db, scope, property.id, media, ctx.now().toISOString()));
    return json(await presentMedia(ctx, property.facts.title, record), 201);
  });

  router.on("GET", "/api/properties/:id/media", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await propertyInScope(ctx, scope, params.id!);
    const items = await listMedia(ctx.db, scope, property.id);
    return json({ items: await Promise.all(items.map((m) => presentMedia(ctx, property.facts.title, m))) });
  });

  router.on("PUT", "/api/properties/:id/media/order", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await propertyInScope(ctx, scope, params.id!);
    const { mediaIds } = await parseBody(request, z.object({ mediaIds: z.array(z.string().max(100)).max(500) }));
    const current = await listMedia(ctx.db, scope, property.id);
    const currentIds = new Set(current.map((m) => m.id));
    if (mediaIds.length !== currentIds.size || new Set(mediaIds).size !== mediaIds.length || !mediaIds.every((id) => currentIds.has(id))) {
      throw new HttpError(400, "validation_error", "The order must list each photo of this property exactly once.", { mediaIds: "Invalid order" });
    }
    await reorderMedia(ctx.db, scope, property.id, mediaIds);
    const items = await listMedia(ctx.db, scope, property.id);
    return json({ items: await Promise.all(items.map((m) => presentMedia(ctx, property.facts.title, m))) });
  });

  router.on("POST", "/api/properties/:id/media/:mediaId/primary", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await propertyInScope(ctx, scope, params.id!);
    if (!(await getMedia(ctx.db, scope, property.id, params.mediaId!))) throw notFound();
    await setPrimaryMedia(ctx.db, scope, property.id, params.mediaId!);
    return json(await presentMedia(ctx, property.facts.title, (await getMedia(ctx.db, scope, property.id, params.mediaId!))!));
  });

  router.on("PUT", "/api/properties/:id/media/:mediaId", async (request, params, ctx) => {
    assertUploadSize(request);
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await propertyInScope(ctx, scope, params.id!);
    const old = await getMedia(ctx.db, scope, property.id, params.mediaId!);
    if (!old) throw notFound();
    const media = await receivePhoto(request, ctx, scope);
    let record: MediaRecord;
    try {
      record = await withObjectRollback(ctx, media.objectKey, () => replaceMedia(ctx.db, scope, old, media, ctx.now().toISOString()));
    } catch (error) {
      if (error instanceof MediaInUseError) throw inUse();
      throw error;
    }
    await ctx.storage.delete(old.objectKey);
    return json(await presentMedia(ctx, property.facts.title, record));
  });

  router.on("DELETE", "/api/properties/:id/media/:mediaId", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await propertyInScope(ctx, scope, params.id!);
    const media = await getMedia(ctx.db, scope, property.id, params.mediaId!);
    if (!media) throw notFound();
    try {
      await deleteMedia(ctx.db, scope, media);
    } catch (error) {
      if (error instanceof MediaInUseError) throw inUse();
      throw error;
    }
    await ctx.storage.delete(media.objectKey);
    return noContent();
  });

  router.on("GET", "/api/properties/:id/media/:mediaId/url", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await propertyInScope(ctx, scope, params.id!);
    const media = await getMedia(ctx.db, scope, property.id, params.mediaId!);
    if (!media) throw notFound();
    const disposition: Disposition = new URL(request.url).searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
    return json(await signFileUrl(ctx.config.mediaSigningSecret, { kind: "source", id: media.id, disposition }, ctx.now()));
  });
}

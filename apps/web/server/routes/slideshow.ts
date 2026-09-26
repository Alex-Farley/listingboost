import { createRenderedMediaVersion, getProperty, getVersionById, listMedia } from "@listingboost/database";
import { nextVersionNumber, slideshowDurationSeconds, slideshowSpec } from "@listingboost/domain";
import type { GenerationService } from "@listingboost/generation";
import { MAX_VIDEO_BYTES, objectKeys, validateReelVideo, VideoRejectedError } from "@listingboost/storage";
import { findTemplate, isBrowserSlideshow } from "@listingboost/templates";
import type { AppContext } from "../context";
import { HttpError, json } from "../http";
import { signFileUrl } from "../media/signed-urls";
import type { Router } from "../router";
import { presentVersion } from "./campaigns";
import { loadAsset } from "./review";

/**
 * Slideshow Reels (R7c, D-019): the browser fetches the plan, renders the
 * agent's own photos into an MP4 with WebCodecs and uploads it. The server
 * checks the file is exactly the Reel the plan describes before storing it.
 */

const MULTIPART_OVERHEAD = 64 * 1024;
const ACTIVE = new Set(["queued", "processing", "completed"]);

const invalidPhotos = () => new HttpError(400, "invalid_photos", "The Reel must use this listing's photos, each at most once.");

async function loadSlideshow(request: Request, ctx: AppContext, campaignId: string, assetId: string) {
  const loaded = await loadAsset(request, ctx, campaignId, assetId);
  const template = findTemplate(loaded.asset.templateId, loaded.asset.templateVersion);
  if (!template || !isBrowserSlideshow(template)) throw new HttpError(400, "not_slideshow", "This asset isn't a slideshow Reel.");
  return { ...loaded, template, spec: slideshowSpec(template.config) };
}

function parsePhotoIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") throw invalidPhotos();
  let ids: unknown;
  try {
    ids = JSON.parse(value);
  } catch {
    throw invalidPhotos();
  }
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id): id is string => typeof id === "string") || new Set(ids).size !== ids.length) {
    throw invalidPhotos();
  }
  return ids;
}

export function registerSlideshowRoutes(router: Router<AppContext>, generation: GenerationService): void {
  router.on("GET", "/api/campaigns/:id/assets/:assetId/slideshow", async (request, params, ctx) => {
    const { scope, campaign, spec } = await loadSlideshow(request, ctx, params.id!, params.assetId!);
    const photos = (await listMedia(ctx.db, scope, campaign.propertyId)).slice(0, spec.maxPhotos);
    return json({
      spec: { width: spec.width, height: spec.height, fps: spec.fps, secondsPerPhoto: spec.secondsPerPhoto, crossfadeSeconds: spec.crossfadeSeconds },
      photos: await Promise.all(
        photos.map(async (p) => ({
          id: p.id,
          width: p.width,
          height: p.height,
          url: (await signFileUrl(ctx.config.mediaSigningSecret, { kind: "source", id: p.id, disposition: "inline" }, ctx.now())).url,
        })),
      ),
    });
  });

  router.on("POST", "/api/campaigns/:id/assets/:assetId/slideshow", async (request, params, ctx) => {
    if (Number(request.headers.get("Content-Length") ?? "0") > MAX_VIDEO_BYTES + MULTIPART_OVERHEAD) {
      throw new HttpError(413, "file_too_large", "The video is too large.");
    }
    const { scope, campaign, asset, template, spec } = await loadSlideshow(request, ctx, params.id!, params.assetId!);
    if (asset.versions[0] && ACTIVE.has(asset.versions[0].state)) throw new HttpError(409, "generation_in_progress", "This asset is still being generated.");
    if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new HttpError(415, "unsupported_media_type", "Upload the Reel as multipart/form-data.");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "invalid_upload", "The upload could not be read.");
    }

    const photoIds = parsePhotoIds(form.get("photoIds"));
    const property = await getProperty(ctx.db, scope, campaign.propertyId);
    const own = new Set((await listMedia(ctx.db, scope, campaign.propertyId)).map((m) => m.id));
    if (!property || photoIds.length > spec.maxPhotos || !photoIds.every((id) => own.has(id))) throw invalidPhotos();

    const file = form.get("video");
    if (!file || typeof file === "string") throw new HttpError(400, "invalid_upload", "Attach the Reel video.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const durationSeconds = slideshowDurationSeconds(photoIds.length, spec);
    let video;
    try {
      video = validateReelVideo(bytes, { width: spec.width, height: spec.height, durationSeconds });
    } catch (error) {
      if (error instanceof VideoRejectedError) throw new HttpError(400, error.code, error.message);
      throw error;
    }

    const id = crypto.randomUUID();
    const objectKey = objectKeys.output(scope.organisationId, id);
    await ctx.storage.put(objectKey, bytes, { contentType: video.contentType });
    try {
      await createRenderedMediaVersion(
        ctx.db,
        scope,
        {
          id,
          campaignId: campaign.id,
          assetId: asset.id,
          versionNumber: nextVersionNumber(asset.versions),
          templateVersion: template.version,
          objectKey,
          contentType: video.contentType,
          byteSize: bytes.length,
          width: video.width,
          height: video.height,
          provider: "listingboost-slideshow",
          model: `browser-${video.codec}`,
          promptVersion: "slideshow-v1",
          parameters: {
            renderer: "browser",
            codec: video.codec,
            fps: spec.fps,
            secondsPerPhoto: spec.secondsPerPhoto,
            crossfadeSeconds: spec.crossfadeSeconds,
            durationSeconds,
          },
          referenceMediaIds: photoIds,
        },
        ctx.now().toISOString(),
      );
    } catch (error) {
      await ctx.storage.delete(objectKey).catch(() => undefined);
      throw error;
    }
    await generation.refreshStatus(scope, campaign.id);
    return json({ version: await presentVersion(ctx, (await getVersionById(ctx.db, scope, id))!) }, 201);
  });
}

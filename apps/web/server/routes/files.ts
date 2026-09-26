import { getOutputForSignedDownload, getSourceMediaForSignedDownload } from "@listingboost/database";
import type { AppContext } from "../context";
import { HttpError, notFound } from "../http";
import { contentDisposition, outputFilename, sourcePhotoFilename } from "../media/filenames";
import { verifyFileSignature } from "../media/signed-urls";
import type { Router } from "../router";

const forbidden = () => new HttpError(403, "invalid_signature", "This link is invalid or has expired.");

export function fileResponse(body: ReadableStream, contentType: string, size: number, disposition: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export function registerFileRoutes(router: Router<AppContext>): void {
  router.on("GET", "/api/files/source/:id", async (request, params, ctx) => {
    const disposition = await verifyFileSignature(ctx.config.mediaSigningSecret, "source", params.id!, new URL(request.url).searchParams, ctx.now());
    if (!disposition) throw forbidden();
    const media = await getSourceMediaForSignedDownload(ctx.db, params.id!);
    if (!media) throw notFound();
    const object = await ctx.storage.get(media.objectKey);
    if (!object) throw notFound();
    const filename = sourcePhotoFilename(media.propertyTitle, media.position, media.contentType);
    return fileResponse(object.body, media.contentType, object.size, contentDisposition(disposition, filename));
  });

  router.on("GET", "/api/files/output/:id", async (request, params, ctx) => {
    const disposition = await verifyFileSignature(ctx.config.mediaSigningSecret, "output", params.id!, new URL(request.url).searchParams, ctx.now());
    if (!disposition) throw forbidden();
    const output = await getOutputForSignedDownload(ctx.db, params.id!);
    if (!output) throw notFound();
    const object = await ctx.storage.get(output.objectKey);
    if (!object) throw notFound();
    const filename = outputFilename(output.propertyTitle, output.slotKey, output.assetType, output.versionNumber, output.contentType);
    return fileResponse(object.body, output.contentType, object.size, contentDisposition(disposition, filename));
  });
}

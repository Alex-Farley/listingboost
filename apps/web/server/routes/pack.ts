import { getCampaign, getProperty, listAssets, recordAudit } from "@listingboost/database";
import { strToU8, Zip, ZipPassThrough } from "fflate";
import type { ObjectStore } from "@listingboost/storage";
import type { PackEntry } from "../media/pack";
import { requireSession } from "../auth/session";
import type { AppContext } from "../context";
import { HttpError, json, notFound } from "../http";
import { contentDisposition, slugify } from "../media/filenames";
import { packEntries, packReadme } from "../media/pack";
import { signFileUrl } from "../media/signed-urls";
import type { Router } from "../router";
import { scopeOf } from "./properties";

export function registerPackRoutes(router: Router<AppContext>): void {
  router.on("GET", "/api/campaigns/:id/pack", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const campaign = await getCampaign(ctx.db, scope, params.id!);
    if (!campaign) throw notFound();
    const property = await getProperty(ctx.db, scope, campaign.propertyId);
    if (!property) throw notFound();
    const entries = packEntries(property.facts.title, await listAssets(ctx.db, scope, campaign.id));
    if (entries.length === 0) throw new HttpError(409, "nothing_approved", "Approve at least one asset before downloading the marketing pack.");

    const root = slugify(property.facts.title);
    // Verify every object exists before committing to a 200 response.
    for (const entry of entries) {
      if (entry.kind === "object" && !(await ctx.storage.get(entry.objectKey))) {
        throw new Error(`Stored output missing for version ${entry.version.id}`);
      }
    }
    await recordAudit(ctx.db, scope, {
      action: "campaign.pack_downloaded",
      subjectType: "campaign",
      subjectId: campaign.id,
      metadata: { files: entries.length },
      now: ctx.now().toISOString(),
    });
    const readme = { path: `${root}/README.txt`, content: packReadme(property.facts.title, entries, ctx.now()) };
    return new Response(streamZip(ctx.storage, entries, readme), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition("attachment", `${root}-marketing-pack.zip`),
        "Cache-Control": "no-store",
      },
    });
  });

  router.on("GET", "/api/campaigns/:id/assets/:assetId/versions/:versionId/download", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const campaign = await getCampaign(ctx.db, scope, params.id!);
    if (!campaign) throw notFound();
    const asset = (await listAssets(ctx.db, scope, campaign.id)).find((a) => a.id === params.assetId);
    const version = asset?.versions.find((v) => v.id === params.versionId);
    if (!version?.outputObjectKey) throw notFound();
    return json(await signFileUrl(ctx.config.mediaSigningSecret, { kind: "output", id: version.id, disposition: "attachment" }, ctx.now()));
  });
}

/**
 * Streams the ZIP so memory stays flat regardless of pack size (Workers have
 * 128 MB). Entries are stored, not deflated: media is already compressed.
 */
function streamZip(storage: ObjectStore, entries: readonly PackEntry[], readme: { path: string; content: string }): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for (const entry of entries) {
          const file = new ZipPassThrough(entry.path);
          zip.add(file);
          if (entry.kind === "text") {
            file.push(strToU8(entry.content), true);
            continue;
          }
          const object = await storage.get(entry.objectKey);
          if (!object) throw new Error(`Stored output missing for version ${entry.version.id}`);
          const reader = object.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            file.push(value as Uint8Array);
          }
          file.push(new Uint8Array(0), true);
        }
        const file = new ZipPassThrough(readme.path);
        zip.add(file);
        file.push(strToU8(readme.content), true);
        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

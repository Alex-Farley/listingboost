import {
  createManualTextVersion,
  decideVersion,
  discardAsset,
  getBrandSettings,
  getCampaign,
  getProperty,
  getVersionById,
  listAssets,
  type OrganisationScope,
} from "@listingboost/database";
import { canTransition, nextVersionNumber, validateCopyClaims } from "@listingboost/domain";
import type { GenerationService } from "@listingboost/generation";
import { findTemplate } from "@listingboost/templates";
import { z } from "zod";
import { requireSession } from "../auth/session";
import type { AppContext } from "../context";
import { HttpError, json, notFound, parseBody } from "../http";
import type { Router } from "../router";
import { presentVersion } from "./campaigns";
import { scopeOf } from "./properties";

const ACTIVE = new Set(["queued", "processing", "completed"]);

/** Loads a non-discarded asset of a campaign in the caller's organisation, or 404. */
async function loadAsset(request: Request, ctx: AppContext, campaignId: string, assetId: string) {
  const scope: OrganisationScope = scopeOf(await requireSession(request, ctx));
  const campaign = await getCampaign(ctx.db, scope, campaignId);
  if (!campaign) throw notFound();
  const asset = (await listAssets(ctx.db, scope, campaign.id)).find((a) => a.id === assetId);
  if (!asset) throw notFound();
  return { scope, campaign, asset };
}

const invalidTransition = () => new HttpError(409, "invalid_transition", "This version can no longer be reviewed.");

export function registerReviewRoutes(router: Router<AppContext>, generation: GenerationService): void {
  for (const [action, decision] of [
    ["approve", "approved"],
    ["reject", "rejected"],
  ] as const) {
    router.on("POST", `/api/campaigns/:id/assets/:assetId/versions/:versionId/${action}`, async (request, params, ctx) => {
      const { scope, campaign, asset } = await loadAsset(request, ctx, params.id!, params.assetId!);
      const version = asset.versions.find((v) => v.id === params.versionId);
      if (!version) throw notFound();
      if (!canTransition(version.state, decision)) throw invalidTransition();
      const target = { campaignId: campaign.id, assetId: asset.id, versionId: version.id };
      if (!(await decideVersion(ctx.db, scope, target, decision, ctx.now().toISOString()))) throw invalidTransition();
      await generation.refreshStatus(scope, campaign.id);
      return json(await presentVersion(ctx, (await getVersionById(ctx.db, scope, version.id))!));
    });
  }

  router.on("PUT", "/api/campaigns/:id/assets/:assetId/text", async (request, params, ctx) => {
    const { scope, campaign, asset } = await loadAsset(request, ctx, params.id!, params.assetId!);
    if (asset.assetType !== "copy") throw new HttpError(400, "not_editable", "Only text assets can be edited.");
    if (asset.versions[0] && ACTIVE.has(asset.versions[0].state)) {
      throw new HttpError(409, "generation_in_progress", "This asset is still being generated.");
    }
    const maxLength = (findTemplate(asset.templateId, asset.templateVersion)?.config.maxLength as number | undefined) ?? 2000;
    const { text } = await parseBody(request, z.object({ text: z.string().trim().min(1, "Enter some text").max(maxLength, `Use at most ${maxLength} characters`) }));
    const property = await getProperty(ctx.db, scope, campaign.propertyId);
    // Edited text is the agent's own wording; unsupported claims are flagged, not blocked.
    const brand = await getBrandSettings(ctx.db, scope);
    const brandText = [brand.agencyName, brand.contactPhone, brand.contactEmail, brand.website].filter((v): v is string => Boolean(v));
    const warnings = property ? validateCopyClaims(text, property.facts, { allowedText: brandText }).violations : [];
    const id = await createManualTextVersion(
      ctx.db,
      scope,
      { campaignId: campaign.id, assetId: asset.id, versionNumber: nextVersionNumber(asset.versions), templateVersion: asset.templateVersion, text },
      ctx.now().toISOString(),
    );
    await generation.refreshStatus(scope, campaign.id);
    return json({ version: await presentVersion(ctx, (await getVersionById(ctx.db, scope, id))!), warnings }, 201);
  });

  router.on("POST", "/api/campaigns/:id/assets/:assetId/discard", async (request, params, ctx) => {
    const { scope, campaign, asset } = await loadAsset(request, ctx, params.id!, params.assetId!);
    if (!(await discardAsset(ctx.db, scope, campaign.id, asset.id, ctx.now().toISOString()))) throw notFound();
    await generation.refreshStatus(scope, campaign.id);
    return json({ id: asset.id, discarded: true });
  });
}

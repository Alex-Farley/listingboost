import {
  createCampaign,
  getCampaign,
  getProperty,
  listAssets,
  listCampaignsForProperty,
  listMedia,
  type AssetRecord,
  type CampaignRecord,
  type VersionRecord,
} from "@listingboost/database";
import { selectFinalVersion } from "@listingboost/domain";
import {
  campaignProgress,
  deriveCampaignStatus,
  GenerationInProgressError,
  GenerationUnavailableError,
  safeErrorMessage,
  type GenerationService,
} from "@listingboost/generation";
import { planCampaignAssets } from "@listingboost/templates";
import { z } from "zod";
import { requireSession } from "../auth/session";
import type { AppContext } from "../context";
import { HttpError, json, notFound, parseBody } from "../http";
import { signFileUrl } from "../media/signed-urls";
import type { Router } from "../router";
import { scopeOf } from "./properties";

export async function presentVersion(ctx: AppContext, v: VersionRecord) {
  const media =
    v.outputObjectKey && v.outputContentType
      ? {
          url: (await signFileUrl(ctx.config.mediaSigningSecret, { kind: "output", id: v.id, disposition: "inline" }, ctx.now())).url,
          contentType: v.outputContentType,
          width: v.outputWidth,
          height: v.outputHeight,
        }
      : null;
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    state: v.state,
    origin: v.origin,
    treatment: v.treatment,
    disclosureLabel: v.disclosureLabel,
    text: v.textContent,
    media,
    errorCode: v.errorCode,
    errorMessage: safeErrorMessage(v.errorCode),
    createdAt: v.createdAt,
    completedAt: v.completedAt,
    approvedAt: v.approvedAt,
  };
}

export async function presentCampaign(ctx: AppContext, generation: GenerationService, campaign: CampaignRecord, assets: AssetRecord[]) {
  const withAvailability = assets.map((a) => ({ ...a, available: generation.isAvailable(generation.capabilityOf(a)) }));
  return {
    id: campaign.id,
    propertyId: campaign.propertyId,
    name: campaign.name,
    status: deriveCampaignStatus(withAvailability),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    progress: campaignProgress(withAvailability),
    assets: await Promise.all(
      withAvailability.map(async (a) => ({
        id: a.id,
        slotKey: a.slotKey,
        assetType: a.assetType,
        aspectRatio: a.aspectRatio,
        sourceMediaId: a.sourceMediaId,
        templateId: a.templateId,
        templateVersion: a.templateVersion,
        available: a.available,
        finalVersionId: selectFinalVersion(a.versions)?.id ?? null,
        versions: await Promise.all(a.versions.map((v) => presentVersion(ctx, v))),
      })),
    ),
  };
}

const createSchema = z.object({ name: z.string().trim().min(1).max(200).optional() });

export function registerCampaignRoutes(router: Router<AppContext>, generation: GenerationService): void {
  async function load(request: Request, ctx: AppContext, campaignId: string) {
    const scope = scopeOf(await requireSession(request, ctx));
    const campaign = await getCampaign(ctx.db, scope, campaignId);
    if (!campaign) throw notFound();
    return { scope, campaign };
  }

  router.on("POST", "/api/properties/:id/campaigns", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await getProperty(ctx.db, scope, params.id!);
    if (!property) throw notFound();
    const input = await parseBody(request, createSchema);
    const photos = await listMedia(ctx.db, scope, property.id);
    if (photos.length === 0) throw new HttpError(409, "photos_required", "Upload at least one photo before creating a campaign.");
    const id = await createCampaign(
      ctx.db,
      scope,
      { propertyId: property.id, name: input.name ?? property.facts.title, assets: planCampaignAssets(photos) },
      ctx.now().toISOString(),
    );
    const campaign = (await getCampaign(ctx.db, scope, id))!;
    return json(await presentCampaign(ctx, generation, campaign, await listAssets(ctx.db, scope, id)), 201);
  });

  router.on("GET", "/api/properties/:id/campaigns", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    if (!(await getProperty(ctx.db, scope, params.id!))) throw notFound();
    const campaigns = await listCampaignsForProperty(ctx.db, scope, params.id!);
    return json({ items: campaigns });
  });

  router.on("GET", "/api/campaigns/:id", async (request, params, ctx) => {
    const { scope, campaign } = await load(request, ctx, params.id!);
    return json(await presentCampaign(ctx, generation, campaign, await listAssets(ctx.db, scope, campaign.id)));
  });

  router.on("POST", "/api/campaigns/:id/generate", async (request, params, ctx) => {
    const { scope, campaign } = await load(request, ctx, params.id!);
    let result;
    try {
      result = await generation.startCampaign(scope, campaign.id);
    } catch (error) {
      if (error instanceof GenerationUnavailableError) {
        throw new HttpError(409, "generation_unavailable", "Generation isn't available for these assets yet.");
      }
      throw error;
    }
    const refreshed = (await getCampaign(ctx.db, scope, campaign.id))!;
    return json({ ...(await presentCampaign(ctx, generation, refreshed, await listAssets(ctx.db, scope, campaign.id))), ...result }, 202);
  });

  router.on("POST", "/api/campaigns/:id/assets/:assetId/regenerate", async (request, params, ctx) => {
    const { scope, campaign } = await load(request, ctx, params.id!);
    try {
      if (!(await generation.regenerate(scope, campaign.id, params.assetId!))) throw notFound();
    } catch (error) {
      if (error instanceof GenerationInProgressError) throw new HttpError(409, "generation_in_progress", "This asset is still being generated.");
      if (error instanceof GenerationUnavailableError) throw new HttpError(409, "generation_unavailable", "Generation isn't available for this asset yet.");
      throw error;
    }
    const refreshed = (await getCampaign(ctx.db, scope, campaign.id))!;
    return json(await presentCampaign(ctx, generation, refreshed, await listAssets(ctx.db, scope, campaign.id)), 202);
  });
}

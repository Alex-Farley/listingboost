import {
  createCampaign,
  getBrandProfile,
  getCampaign,
  getProperty,
  listAssets,
  listCampaignsForProperty,
  listMedia,
  type AssetRecord,
  type CampaignRecord,
  type VersionRecord,
} from "@listingboost/database";
import { brandSnapshotOf, selectFinalVersion } from "@listingboost/domain";
import {
  campaignProgress,
  deriveCampaignStatus,
  GenerationInProgressError,
  GenerationUnavailableError,
  safeErrorMessage,
  type GenerationService,
} from "@listingboost/generation";
import { findTemplate, isBrowserSlideshow, planCampaignAssets } from "@listingboost/templates";
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
  const withAvailability = assets.map((a) => {
    const availability = generation.availabilityOf(a, campaign.brandSnapshot);
    const renderer = availability.available
      ? ("server" as const)
      : availability.reason === "provider_unavailable" && isBrowserSlideshow(findTemplate(a.templateId, a.templateVersion))
        ? ("browser" as const)
        : null;
    // Only a preference that cannot be honoured gets a reason of its own; other gaps keep the existing wording.
    const unavailableReason = renderer === null && availability.reason === "template_unavailable" ? availability.reason : null;
    return { ...a, renderer, available: renderer === "server", unavailableReason };
  });
  // Progress counts a browser-rendered asset as available: it can still be made.
  const forProgress = withAvailability.map((a) => ({ ...a, available: a.renderer !== null }));
  return {
    id: campaign.id,
    propertyId: campaign.propertyId,
    name: campaign.name,
    status: deriveCampaignStatus(forProgress),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    progress: campaignProgress(forProgress),
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
        unavailableReason: a.unavailableReason,
        unavailableMessage: a.unavailableReason ? TEMPLATE_UNAVAILABLE_MESSAGE : null,
        renderer: a.renderer,
        finalVersionId: selectFinalVersion(a.versions)?.id ?? null,
        versions: await Promise.all(a.versions.map((v) => presentVersion(ctx, v))),
      })),
    ),
  };
}

const TEMPLATE_UNAVAILABLE_MESSAGE =
  "Your preferred template for this asset is no longer available, so it was not made. Choose another in Brand Settings, then create a new campaign.";

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
    // The campaign keeps the brand as it is now; later changes apply to new campaigns only (D-021).
    // Tone of voice is not captured: it is stored on the profile and not applied to copy.
    const brandSnapshot = brandSnapshotOf(await getBrandProfile(ctx.db, scope));
    const id = await createCampaign(
      ctx.db,
      scope,
      {
        propertyId: property.id,
        name: input.name ?? property.facts.title,
        assets: planCampaignAssets(photos, brandSnapshot.preferredTemplates),
        brandSnapshot,
      },
      ctx.now().toISOString(),
    );
    const campaign = (await getCampaign(ctx.db, scope, id))!;
    return json(await presentCampaign(ctx, generation, campaign, await listAssets(ctx.db, scope, id)), 201);
  });

  router.on("GET", "/api/properties/:id/campaigns", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    if (!(await getProperty(ctx.db, scope, params.id!))) throw notFound();
    const campaigns = await listCampaignsForProperty(ctx.db, scope, params.id!);
    // The captured brand is internal to generation; the list shows the campaign only.
    return json({ items: campaigns.map((c) => ({ id: c.id, propertyId: c.propertyId, name: c.name, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt })) });
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

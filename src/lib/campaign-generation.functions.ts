import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bindings } from "./bindings.server";
import { createListingBoostAuthService } from "./auth.server";
import type { AssetSpecification, GenerationStrategy } from "./generation-provider";
import { buildGenerationJobIdempotencyKey } from "./campaign-generation";

const assetSpecificationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "video"]),
  aspectRatio: z.string().regex(/^\d+:\d+$/),
  resolution: z.enum(["480p", "720p", "1080p", "1k", "2k", "4k"]),
  durationSeconds: z.number().positive().optional(),
  references: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["image", "video", "audio"]),
    role: z.enum(["reference", "start", "end", "audio"]),
  })),
  audio: z.object({ enabled: z.boolean() }).optional(),
  outputCount: z.literal(1),
});

const strategySchema = z.object({
  specificationId: z.string().min(1),
  providerKey: z.string().min(1),
  modelKey: z.string().min(1),
  estimatedCostUsd: z.number().nonnegative().optional(),
  maxAttempts: z.number().int().positive(),
});

function db() {
  const value = bindings().DB;
  if (!value) throw new Error("Campaign storage is not available.");
  return value;
}

export type CreateCampaignGenerationJobInput = {
  campaignId: string;
  campaignAssetId: string;
  assetKey: string;
  specification: AssetSpecification;
  strategy: GenerationStrategy;
};

export const createCampaignGenerationJobFn = createServerFn({ method: "POST" })
  .validator(z.object({
    campaignId: z.string().uuid(),
    campaignAssetId: z.string().uuid(),
    assetKey: z.string().min(1).max(100),
    specification: assetSpecificationSchema,
    strategy: strategySchema,
  }))
  .handler(async ({ data }) => {
    const database = db();
    const user = await createListingBoostAuthService(database).getCurrentUser();
    if (!user) throw new Error("Sign in to generate campaign assets.");

    const asset = await database.prepare(
      `SELECT a.id, a.campaign_id
       FROM campaign_assets a
       JOIN campaigns c ON c.id=a.campaign_id
       WHERE a.id=? AND a.campaign_id=? AND c.auth_user_id=?`,
    ).bind(data.campaignAssetId, data.campaignId, user.id).first() as { id?: unknown; campaign_id?: unknown } | null;
    if (!asset || asset.id !== data.campaignAssetId || asset.campaign_id !== data.campaignId) {
      throw new Error("Campaign asset not found.");
    }
    if (data.specification.id !== data.assetKey || data.strategy.specificationId !== data.specification.id) {
      throw new Error("Generation specification does not match the campaign asset.");
    }

    const idempotencyKey = buildGenerationJobIdempotencyKey(data.campaignAssetId, data.assetKey, 0);
    const existing = await database.prepare(
      `SELECT id, campaign_id, campaign_asset_id
       FROM generation_jobs WHERE idempotency_key=?`,
    ).bind(idempotencyKey).first() as { id?: unknown; campaign_id?: unknown; campaign_asset_id?: unknown } | null;
    if (existing) {
      if (existing.campaign_id !== data.campaignId || existing.campaign_asset_id !== data.campaignAssetId) {
        throw new Error("Generation idempotency key is already owned by another campaign asset.");
      }
      return { generationJobId: String(existing.id), idempotent: true as const };
    }

    const generationJobId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await database.prepare(
        `INSERT INTO generation_jobs (
          id,campaign_id,campaign_asset_id,asset_key,state,attempt,idempotency_key,
          provider_key,provider_model,estimated_cost_usd,specification_json,strategy_json,
          created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        generationJobId,
        data.campaignId,
        data.campaignAssetId,
        data.assetKey,
        "pending",
        0,
        idempotencyKey,
        data.strategy.providerKey,
        data.strategy.modelKey,
        data.strategy.estimatedCostUsd ?? null,
        JSON.stringify(data.specification),
        JSON.stringify(data.strategy),
        now,
        now,
      ).run();

      await database.prepare(
        `UPDATE campaign_assets
         SET asset_key=?, generation_status='pending', generation_attempt=0,
             provider_model=?, generation_job_id=?, updated_at=?
         WHERE id=? AND campaign_id=?`,
      ).bind(
        data.assetKey,
        data.strategy.modelKey,
        generationJobId,
        now,
        data.campaignAssetId,
        data.campaignId,
      ).run();
    } catch (error) {
      await database.prepare("DELETE FROM generation_jobs WHERE id=? AND state='pending'").bind(generationJobId).run();
      throw error;
    }

    return { generationJobId, idempotent: false as const };
  });

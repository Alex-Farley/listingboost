import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { GenerationJobRecord } from "./generation-job";
import type { GenerationResult } from "./generation-provider";
import type { GenerationOutputStore } from "./generation-output-store";

function requireCampaignOwner(campaignId: string, row: Record<string, unknown> | null): string {
  const ownerUserId = row?.auth_user_id;
  if (typeof ownerUserId !== "string" || ownerUserId.length === 0) {
    throw new Error(`Campaign ${campaignId} has no ListingBoost owner.`);
  }
  return ownerUserId;
}

/**
 * ListingBoost-owned output sink for completed provider generations.
 *
 * Provider source URLs are treated as transient inputs only: the bytes are
 * fetched server-side, stored under a ListingBoost-owned R2 key, and recorded
 * in D1. Customer-facing delivery can therefore ignore provider URLs.
 */
export function createR2GenerationOutputStore(
  database: D1Database,
  bucket: R2Bucket,
  fetcher: typeof fetch = fetch,
): GenerationOutputStore {
  return {
    async persist(job: GenerationJobRecord, result: GenerationResult) {
      const campaign = await database
        .prepare("SELECT auth_user_id FROM campaigns WHERE id=?")
        .bind(job.campaignId)
        .first<Record<string, unknown>>();
      const ownerUserId = requireCampaignOwner(job.campaignId, campaign);
      const providerKey = job.strategy?.providerKey ?? job.providerKey;
      const createdKeys: string[] = [];

      try {
        for (const output of result.outputs) {
          if (!output.sourceUrl) {
            throw new Error(`Generation output ${output.mediaId} has no source URL.`);
          }

          const existing = await database.prepare(
            "SELECT id FROM campaign_media WHERE campaign_id=? AND provider_key=? AND provider_media_id=? LIMIT 1",
          ).bind(job.campaignId, providerKey ?? null, output.mediaId).first<{ id?: unknown }>();
          if (existing?.id) continue;

          const response = await fetcher(output.sourceUrl);
          if (!response.ok) {
            throw new Error(`Failed to download generation output ${output.mediaId}: HTTP ${response.status}.`);
          }

          const body = await response.arrayBuffer();
          const id = crypto.randomUUID();
          const objectKey = `campaign-media/${output.kind}/${id}`;
          const contentType = output.contentType || response.headers.get("content-type") || "application/octet-stream";

          await bucket.put(objectKey, body, { httpMetadata: { contentType } });
          createdKeys.push(objectKey);

          await database.prepare(
            `INSERT INTO campaign_media
              (id,campaign_id,kind,object_key,content_type,byte_size,provider_key,provider_media_id,owner_user_id)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          ).bind(
            id,
            job.campaignId,
            output.kind,
            objectKey,
            contentType,
            body.byteLength,
            providerKey ?? null,
            output.mediaId,
            ownerUserId,
          ).run();
        }
      } catch (error) {
        await Promise.all(createdKeys.map((key) => bucket.delete(key).catch(() => undefined)));
        throw error;
      }
    },
  };
}

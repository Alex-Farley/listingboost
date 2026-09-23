import { describe, expect, test } from "bun:test";
import { createR2GenerationOutputStore } from "../src/lib/r2-generation-output-store.server";
import type { GenerationJobRecord } from "../src/lib/generation-job";
import type { GenerationResult } from "../src/lib/generation-provider";

const job: GenerationJobRecord = {
  id: "job-1",
  campaignId: "campaign-1",
  campaignAssetId: "asset-1",
  assetKey: "hero",
  state: "succeeded",
  attempt: 0,
  idempotencyKey: "campaign-1:hero:0",
  strategy: { specificationId: "hero", providerKey: "fake", modelKey: "model", maxAttempts: 2 },
  createdAt: "2026-09-23T04:00:00Z",
  updatedAt: "2026-09-23T04:01:00Z",
};

function createFakeDatabase() {
  const media: Array<Record<string, unknown>> = [];
  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM campaigns")) return { auth_user_id: "user-1" } as T;
              if (sql.includes("FROM campaign_media")) {
                const match = media.find((row) => row.campaign_id === values[0] && row.provider_key === values[1] && row.provider_media_id === values[2]);
                return (match ? { id: match.id } : null) as T;
              }
              return null as T;
            },
            async run() {
              media.push({
                id: values[0], campaign_id: values[1], kind: values[2], object_key: values[3],
                content_type: values[4], byte_size: values[5], provider_key: values[6],
                provider_media_id: values[7], owner_user_id: values[8],
              });
            },
          };
        },
      };
    },
  } as any;
  return { database, media };
}

function createFakeBucket() {
  const objects = new Map<string, ArrayBuffer>();
  const bucket = {
    async put(key: string, body: ArrayBuffer) { objects.set(key, body); },
    async delete(key: string) { objects.delete(key); },
  } as any;
  return { bucket, objects };
}

describe("R2 generation output store", () => {
  test("downloads provider output and records ListingBoost-owned R2/D1 provenance", async () => {
    const { database, media } = createFakeDatabase();
    const { bucket, objects } = createFakeBucket();
    const result: GenerationResult = {
      state: "succeeded",
      outputs: [{ mediaId: "provider-media-1", kind: "image", contentType: "image/png", sourceUrl: "https://provider.test/output.png" }],
    };
    const store = createR2GenerationOutputStore(database, bucket, async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/png" },
    }));

    await store.persist(job, result);

    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      campaign_id: "campaign-1",
      kind: "image",
      content_type: "image/png",
      byte_size: 3,
      provider_key: "fake",
      provider_media_id: "provider-media-1",
      owner_user_id: "user-1",
    });
    expect(media[0]?.object_key).toMatch(/^campaign-media\/image\//);
    expect(objects.size).toBe(1);
  });

  test("is idempotent for a redelivered provider output", async () => {
    const { database, media } = createFakeDatabase();
    const { bucket, objects } = createFakeBucket();
    let downloads = 0;
    const result: GenerationResult = {
      state: "succeeded",
      outputs: [{ mediaId: "provider-media-1", kind: "image", contentType: "image/png", sourceUrl: "https://provider.test/output.png" }],
    };
    const store = createR2GenerationOutputStore(database, bucket, async () => {
      downloads += 1;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });

    await store.persist(job, result);
    await store.persist(job, result);

    expect(downloads).toBe(1);
    expect(media).toHaveLength(1);
    expect(objects.size).toBe(1);
  });
});

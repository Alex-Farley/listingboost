import { describe, expect, test } from "bun:test";
import { generationOutputRecords, type GenerationOutputStore } from "../src/lib/generation-output-store";
import { GenerationWorker, type GenerationProviderResolver } from "../src/lib/generation-worker";
import type { GenerationJobRecord } from "../src/lib/generation-job";
import type { GenerationJobStore } from "../src/lib/generation-orchestrator";
import type { GenerationProvider, GenerationResult } from "../src/lib/generation-provider";

const job: GenerationJobRecord = {
  id: "job-output-1",
  campaignId: "campaign-1",
  campaignAssetId: "asset-1",
  assetKey: "hero",
  state: "queued",
  attempt: 0,
  idempotencyKey: "campaign-1:hero:0",
  specification: { id: "hero", kind: "image", aspectRatio: "4:5", resolution: "2k", references: [], outputCount: 1 },
  strategy: { specificationId: "hero", providerKey: "fake", modelKey: "model", maxAttempts: 2 },
  createdAt: "2026-09-23T04:00:00Z",
  updatedAt: "2026-09-23T04:00:00Z",
};

class Store implements GenerationJobStore {
  current = job;
  async findByIdempotencyKey(key: string) { return key === job.idempotencyKey ? this.current : null; }
  async create() { throw new Error("unused"); }
  async update(_id: string, update: Parameters<GenerationJobStore["update"]>[1]) {
    this.current = { ...this.current, ...update, updatedAt: "2026-09-23T04:01:00Z" };
    return this.current;
  }
}

class Provider implements GenerationProvider {
  providerKey = "fake";
  async submit() { return { providerJobId: "provider-job", state: "succeeded" as const }; }
  async getStatus(): Promise<GenerationResult> {
    return {
      state: "succeeded",
      outputs: [{ mediaId: "provider-media-1", kind: "image", contentType: "image/png", sourceUrl: "https://provider.test/output.png" }],
    };
  }
}

describe("generation output store boundary", () => {
  test("maps provider outputs to ListingBoost-owned storage records without provider-specific fields", () => {
    const result: GenerationResult = {
      state: "succeeded",
      outputs: [{ mediaId: "provider-media-1", kind: "image", contentType: "image/png" }],
    };
    expect(generationOutputRecords(job, result)).toEqual([{
      campaignId: "campaign-1",
      campaignAssetId: "asset-1",
      assetKey: "hero",
      providerKey: "fake",
      providerMediaId: "provider-media-1",
      kind: "image",
      contentType: "image/png",
    }]);
  });

  test("worker persists successful outputs only after provider completion", async () => {
    const store = new Store();
    const persisted: GenerationResult[] = [];
    const outputs: GenerationOutputStore = { persist: async (_job, result) => { persisted.push(result); } };
    const resolver: GenerationProviderResolver = { resolve: (key) => { expect(key).toBe("fake"); return new Provider(); } };

    const result = await new GenerationWorker(store, resolver, outputs).handle({
      generationJobId: job.id,
      idempotencyKey: job.idempotencyKey,
    });

    expect(result.state).toBe("succeeded");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.outputs[0]?.mediaId).toBe("provider-media-1");
  });
});

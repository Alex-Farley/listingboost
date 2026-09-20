import { describe, expect, test } from "bun:test";
import type {
  AssetSpecification,
  GenerationProvider,
  GenerationResult,
  GenerationStrategy,
  ProviderSubmission,
} from "../src/lib/generation-provider";
import { GenerationOrchestrator, type GenerationJobStore } from "../src/lib/generation-orchestrator";
import type { GenerationJobRecord } from "../src/lib/generation-job";

const specification: AssetSpecification = {
  id: "hero",
  kind: "image",
  aspectRatio: "4:5",
  resolution: "2k",
  references: [{ id: "source-1", kind: "image", role: "reference" }],
  outputCount: 1,
};
const strategy: GenerationStrategy = {
  specificationId: "hero",
  providerKey: "fake",
  modelKey: "model-v1",
  maxAttempts: 1,
};
const makeJob = (): GenerationJobRecord => ({
  id: "job-1",
  campaignId: "campaign-1",
  campaignAssetId: "asset-1",
  assetKey: "hero",
  state: "pending",
  attempt: 0,
  idempotencyKey: "campaign-1:hero:0",
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-20T10:00:00.000Z",
});

class MemoryStore implements GenerationJobStore {
  jobs = new Map<string, GenerationJobRecord>();
  async findByIdempotencyKey(key: string) {
    return [...this.jobs.values()].find(job => job.idempotencyKey === key) ?? null;
  }
  async create(job: GenerationJobRecord) {
    if (this.jobs.has(job.id)) throw new Error("duplicate job");
    this.jobs.set(job.id, job);
  }
  async update(id: string, update: Parameters<GenerationJobStore["update"]>[1]) {
    const current = this.jobs.get(id);
    if (!current) throw new Error("missing job");
    const next = { ...current, ...update, updatedAt: "2026-09-20T10:01:00.000Z" };
    this.jobs.set(id, next);
    return next;
  }
}

class FakeProvider implements GenerationProvider {
  readonly providerKey = "fake";
  submissions = 0;
  result: GenerationResult = {
    state: "succeeded",
    outputs: [{ mediaId: "media-1", kind: "image", contentType: "image/png" }],
    actualCostUsd: 0.12,
    provenance: { providerJobId: "provider-job-1", providerModel: "model-v1" },
  };
  async submit(_s: AssetSpecification, _st: GenerationStrategy, _key: string): Promise<ProviderSubmission> {
    this.submissions += 1;
    return { providerJobId: "provider-job-1", state: "queued", provenance: { providerJobId: "provider-job-1" } };
  }
  async getStatus(_id: string) { return this.result; }
}

describe("generation orchestrator", () => {
  test("creates a queued job and prevents duplicate provider submission", async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    const orchestrator = new GenerationOrchestrator(store, provider);
    const first = await orchestrator.start({ job: makeJob(), specification, strategy });
    const second = await orchestrator.start({ job: makeJob(), specification, strategy });
    expect(first.job.state).toBe("queued");
    expect(second.job.id).toBe(first.job.id);
    expect(provider.submissions).toBe(1);
  });

  test("reconciles a queued job and records provider cost and output", async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    const orchestrator = new GenerationOrchestrator(store, provider);
    const started = await orchestrator.start({ job: makeJob(), specification, strategy });
    const result = await orchestrator.reconcile(started.job);
    expect(result.job.state).toBe("succeeded");
    expect(result.job.actualCostUsd).toBe(0.12);
    expect(result.result?.outputs[0]?.mediaId).toBe("media-1");
  });

  test("turns provider submission errors into retryable failures", async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider();
    provider.submit = async () => { throw new Error("provider unavailable"); };
    const orchestrator = new GenerationOrchestrator(store, provider);
    const result = await orchestrator.start({ job: makeJob(), specification, strategy });
    expect(result.job.state).toBe("failed");
    expect(result.job.failure).toEqual({
      code: "provider_submission_failed",
      message: "provider unavailable",
      retryable: true,
    });
  });
});

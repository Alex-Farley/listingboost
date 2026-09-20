import { describe, expect, test } from "bun:test";
import type { GenerationJobRecord } from "../src/lib/generation-job";
import { GenerationQueueDispatcher, type GenerationQueue } from "../src/lib/generation-queue";
import type { GenerationJobStore } from "../src/lib/generation-orchestrator";

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
  async create(job: GenerationJobRecord) { this.jobs.set(job.id, job); }
  async update(id: string, update: Parameters<GenerationJobStore["update"]>[1]) {
    const current = this.jobs.get(id);
    if (!current) throw new Error("missing job");
    const next = { ...current, ...update, updatedAt: "2026-09-20T10:01:00.000Z" };
    this.jobs.set(id, next);
    return next;
  }
}

class FakeQueue implements GenerationQueue {
  messages: Array<{ generationJobId: string; idempotencyKey: string }> = [];
  shouldFail = false;
  async send(message: { generationJobId: string; idempotencyKey: string }) {
    if (this.shouldFail) throw new Error("queue unavailable");
    this.messages.push(message);
  }
}

describe("generation queue dispatcher", () => {
  test("persists before dispatch and sends only the job identity", async () => {
    const store = new MemoryStore();
    const queue = new FakeQueue();
    const dispatcher = new GenerationQueueDispatcher(store, queue);
    const result = await dispatcher.enqueue({
      job: makeJob(),
      specification: {
        id: "hero",
        kind: "image",
        aspectRatio: "4:5",
        resolution: "2k",
        references: [],
        outputCount: 1,
      },
      strategy: { specificationId: "hero", providerKey: "fake", modelKey: "model", maxAttempts: 1 },
    });

    expect(result.state).toBe("queued");
    expect(queue.messages).toEqual([{
      generationJobId: "job-1",
      idempotencyKey: "campaign-1:hero:0",
    }]);
  });

  test("is idempotent when the job already exists", async () => {
    const store = new MemoryStore();
    await store.create(makeJob());
    const queue = new FakeQueue();
    const dispatcher = new GenerationQueueDispatcher(store, queue);
    const result = await dispatcher.enqueue({
      job: makeJob(),
      specification: { id: "hero", kind: "image", aspectRatio: "4:5", resolution: "2k", references: [], outputCount: 1 },
      strategy: { specificationId: "hero", providerKey: "fake", modelKey: "model", maxAttempts: 1 },
    });
    expect(result.state).toBe("pending");
    expect(queue.messages).toHaveLength(0);
  });

  test("records retryable dispatch failure", async () => {
    const store = new MemoryStore();
    const queue = new FakeQueue();
    queue.shouldFail = true;
    const dispatcher = new GenerationQueueDispatcher(store, queue);
    const result = await dispatcher.enqueue({
      job: makeJob(),
      specification: { id: "hero", kind: "image", aspectRatio: "4:5", resolution: "2k", references: [], outputCount: 1 },
      strategy: { specificationId: "hero", providerKey: "fake", modelKey: "model", maxAttempts: 1 },
    });
    expect(result.state).toBe("failed");
    expect(result.failure?.retryable).toBe(true);
    expect(result.failure?.code).toBe("queue_dispatch_failed");
  });
});

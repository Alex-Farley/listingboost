import { describe, expect, test } from "bun:test";
import { consumeGenerationQueueDelivery, type GenerationQueueDelivery } from "../src/lib/generation-queue-consumer.server";
import type { GenerationJobRecord } from "../src/lib/generation-job";
import type { GenerationJobStore } from "../src/lib/generation-orchestrator";
import type { GenerationProvider } from "../src/lib/generation-provider";
import type { GenerationProviderResolver } from "../src/lib/generation-worker";

const job: GenerationJobRecord = {
  id: "job-1",
  campaignId: "campaign-1",
  campaignAssetId: "asset-1",
  assetKey: "hero",
  state: "queued",
  attempt: 0,
  idempotencyKey: "campaign-1:hero:0",
  specification: {
    id: "hero",
    kind: "image",
    aspectRatio: "4:5",
    resolution: "2k",
    references: [],
    outputCount: 1,
  },
  strategy: {
    specificationId: "hero",
    providerKey: "fake",
    modelKey: "model",
    maxAttempts: 2,
  },
  createdAt: "2026-09-20T10:00:00Z",
  updatedAt: "2026-09-20T10:00:00Z",
};

class Store implements GenerationJobStore {
  current = job;

  async findByIdempotencyKey(key: string) {
    return key === job.idempotencyKey ? this.current : null;
  }

  async create() {
    throw new Error("unused");
  }

  async update(id: string, update: Parameters<GenerationJobStore["update"]>[1]) {
    this.current = { ...this.current, ...update, updatedAt: "2026-09-20T10:01:00Z" };
    return this.current;
  }
}

class Provider implements GenerationProvider {
  providerKey = "fake";

  async submit() {
    return { providerJobId: "provider-job", state: "queued" as const };
  }

  async getStatus() {
    return { state: "running" as const, outputs: [] };
  }
}

type DeliveryOverrides = Partial<Omit<GenerationQueueDelivery, "ack" | "retry">>;

function delivery(overrides: DeliveryOverrides = {}) {
  let acked = false;
  let retried = false;
  const value: GenerationQueueDelivery = {
    body: { generationJobId: job.id, idempotencyKey: job.idempotencyKey },
    ack: () => { acked = true; },
    retry: () => { retried = true; },
    ...overrides,
  };
  return { value, get acked() { return acked; }, get retried() { return retried; } };
}

describe("generation queue consumer", () => {
  test("acknowledges a delivery after the durable worker accepts it", async () => {
    const d = delivery();
    const provider = new Provider();
    const providers: GenerationProviderResolver = { resolve: () => provider };

    const result = await consumeGenerationQueueDelivery(d.value, {
      store: new Store(),
      providers,
    });

    expect(result.outcome).toBe("acked");
    expect(d.acked).toBe(true);
    expect(d.retried).toBe(false);
  });

  test("retries a delivery when durable identity validation fails", async () => {
    const d = delivery({ body: { generationJobId: "wrong", idempotencyKey: job.idempotencyKey } });
    const providers: GenerationProviderResolver = { resolve: () => new Provider() };

    const result = await consumeGenerationQueueDelivery(d.value, {
      store: new Store(),
      providers,
    });

    expect(result.outcome).toBe("retried");
    expect(d.acked).toBe(false);
    expect(d.retried).toBe(true);
  });

  test("retries a message for a missing durable job before resolving any provider", async () => {
    let providerResolved = false;
    const d = delivery({ body: { generationJobId: "missing", idempotencyKey: "missing-key" } });
    const providers: GenerationProviderResolver = {
      resolve: () => {
        providerResolved = true;
        return new Provider();
      },
    };

    const result = await consumeGenerationQueueDelivery(d.value, {
      store: {
        async findByIdempotencyKey() { return null; },
        async create() { throw new Error("unused"); },
        async update() { throw new Error("unused"); },
      },
      providers,
    });

    expect(result.outcome).toBe("retried");
    expect(d.acked).toBe(false);
    expect(d.retried).toBe(true);
    expect(providerResolved).toBe(false);
  });

  test("queue payload contains only durable job identity and idempotency data", () => {
    const message = {
      generationJobId: "job-123",
      idempotencyKey: "campaign-asset-123",
    };

    expect(Object.keys(message).sort()).toEqual(["generationJobId", "idempotencyKey"]);
  });
});

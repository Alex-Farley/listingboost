import { describe, expect, mock, test } from "bun:test";
import {
  createCloudflareGenerationQueue,
  handleGenerationQueueBatch,
  type CloudflareQueueProducer,
  type GenerationQueueBatchMessage,
} from "../src/lib/cloudflare-generation-queue.server";
import type { AppEnv } from "../src/lib/bindings.server";
import type { GenerationQueueMessage } from "../src/lib/generation-queue";
import type { GenerationWorker } from "../src/lib/generation-worker";

// The configured adapter imports the Workers runtime-only `cloudflare:workers`
// module. Mock that runtime boundary before dynamically loading the adapter so
// the domain-level test suite remains executable under Bun.
mock.module("cloudflare:workers", () => ({ env: {} }));
const { createConfiguredGenerationQueue } = await import(
  "../src/lib/cloudflare-generation-queue-binding.server"
);

describe("Cloudflare generation queue runtime boundary", () => {
  test("adapts a Cloudflare-style producer without leaking it into the domain queue contract", async () => {
    const sent: GenerationQueueMessage[] = [];
    const producer: CloudflareQueueProducer = {
      async send(message) {
        sent.push(message);
      },
    };

    const queue = createCloudflareGenerationQueue(producer);
    await queue.send({ generationJobId: "job-1", idempotencyKey: "asset-1:hero:0" });

    expect(sent).toEqual([{ generationJobId: "job-1", idempotencyKey: "asset-1:hero:0" }]);
  });

  test("resolves the configured Cloudflare binding into the domain queue contract", async () => {
    const sent: GenerationQueueMessage[] = [];
    const producer: CloudflareQueueProducer = {
      async send(message) {
        sent.push(message);
      },
    };

    const queue = createConfiguredGenerationQueue(
      () => ({ GENERATION_QUEUE: producer } as unknown as AppEnv),
    );
    await queue.send({ generationJobId: "job-1", idempotencyKey: "k1" });

    expect(sent).toEqual([{ generationJobId: "job-1", idempotencyKey: "k1" }]);
  });

  test("fails closed when the generation queue binding is missing", () => {
    expect(() => createConfiguredGenerationQueue(() => ({}))).toThrow(
      "Generation queue is not configured.",
    );
  });

  test("retries only messages whose worker processing fails", async () => {
    const handled: string[] = [];
    const retried: string[] = [];
    const worker = {
      async handle(message: GenerationQueueMessage) {
        handled.push(message.generationJobId);
        if (message.generationJobId === "job-2") throw new Error("transient");
      },
    } as unknown as GenerationWorker;

    const messages: GenerationQueueBatchMessage[] = [
      {
        body: { generationJobId: "job-1", idempotencyKey: "k1" },
        retry() {
          retried.push("job-1");
        },
      },
      {
        body: { generationJobId: "job-2", idempotencyKey: "k2" },
        retry() {
          retried.push("job-2");
        },
      },
    ];

    await handleGenerationQueueBatch({ messages }, worker);

    expect(handled).toEqual(["job-1", "job-2"]);
    expect(retried).toEqual(["job-2"]);
  });
});

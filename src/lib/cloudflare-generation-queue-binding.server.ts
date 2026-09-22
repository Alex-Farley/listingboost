import { bindings } from "./bindings.server";
import {
  createCloudflareGenerationQueue,
  type CloudflareQueueProducer,
} from "./cloudflare-generation-queue.server";
import type { GenerationQueue } from "./generation-queue";

/**
 * Resolve the configured Cloudflare Queue without leaking the runtime binding
 * into the provider-neutral generation layer.
 */
export function createConfiguredGenerationQueue(): GenerationQueue {
  const queue = bindings().GENERATION_QUEUE;
  if (!queue) {
    throw new Error("Generation queue is not configured.");
  }
  return createCloudflareGenerationQueue(queue as unknown as CloudflareQueueProducer);
}

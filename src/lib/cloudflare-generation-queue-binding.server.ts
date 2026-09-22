import { bindings, type AppEnv } from "./bindings.server";
import {
  createCloudflareGenerationQueue,
} from "./cloudflare-generation-queue.server";
import type { GenerationQueue } from "./generation-queue";

/**
 * Resolve the configured Cloudflare Queue without leaking the runtime binding
 * into the provider-neutral generation layer.
 */
export function createConfiguredGenerationQueue(
  loadBindings: () => AppEnv = bindings,
): GenerationQueue {
  const queue = loadBindings().GENERATION_QUEUE;
  if (!queue) {
    throw new Error("Generation queue is not configured.");
  }
  return createCloudflareGenerationQueue(queue);
}

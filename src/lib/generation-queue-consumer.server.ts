import { GenerationWorker, type GenerationProviderResolver } from "./generation-worker";
import type { GenerationJobStore } from "./generation-orchestrator";
import type { GenerationQueueMessage } from "./generation-queue";

export type GenerationQueueDelivery = {
  body: GenerationQueueMessage;
  ack(): void;
  retry(): void;
};

export type GenerationQueueConsumeResult =
  | { outcome: "acked"; generationJobId: string }
  | { outcome: "retried"; generationJobId: string; error: unknown };

/**
 * Consume one ListingBoost-owned queue delivery without exposing transport
 * details to the generation worker or provider adapters.
 *
 * D1 remains authoritative: the worker reloads the durable job/request before
 * invoking a provider. A malformed/stale message is therefore retried rather
 * than acknowledged and silently discarded.
 */
export async function consumeGenerationQueueDelivery(
  delivery: GenerationQueueDelivery,
  dependencies: {
    store: GenerationJobStore;
    providers: GenerationProviderResolver;
  },
): Promise<GenerationQueueConsumeResult> {
  const worker = new GenerationWorker(dependencies.store, dependencies.providers);

  try {
    await worker.handle(delivery.body);
    delivery.ack();
    return { outcome: "acked", generationJobId: delivery.body.generationJobId };
  } catch (error) {
    delivery.retry();
    return {
      outcome: "retried",
      generationJobId: delivery.body.generationJobId,
      error,
    };
  }
}

import { assertGenerationTransition, type GenerationJobRecord } from "./generation-job";
import type { GenerationJobStore, GenerationJobUpdate } from "./generation-orchestrator";
import type { AssetSpecification, GenerationStrategy, GenerationFailure } from "./generation-provider";

export type GenerationQueueMessage = {
  generationJobId: string;
  idempotencyKey: string;
};

export interface GenerationQueue {
  send(message: GenerationQueueMessage): Promise<void>;
}

export type QueueableGenerationRequest = {
  job: GenerationJobRecord;
  specification: AssetSpecification;
  strategy: GenerationStrategy;
};

export class GenerationQueueDispatcher {
  constructor(
    private readonly store: GenerationJobStore,
    private readonly queue: GenerationQueue,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async enqueue(request: QueueableGenerationRequest): Promise<GenerationJobRecord> {
    const existing = await this.store.findByIdempotencyKey(request.job.idempotencyKey);
    if (existing && existing.state !== "pending") return existing;

    const job = existing ?? request.job;
    if (job.state !== "pending") {
      throw new Error("Queueable generation jobs must be created in pending state.");
    }

    if (!existing) await this.store.create(job);
    assertGenerationTransition(job.state, "queued");
    const queued: GenerationJobUpdate = { state: "queued", failure: undefined };
    const persisted = await this.store.update(job.id, queued);

    try {
      await this.queue.send({
        generationJobId: persisted.id,
        idempotencyKey: persisted.idempotencyKey,
      });
      return persisted;
    } catch (error) {
      assertGenerationTransition(persisted.state, "failed");
      const failure: GenerationFailure = {
        code: "queue_dispatch_failed",
        retryable: true,
        message: error instanceof Error ? error.message : "Generation queue dispatch failed.",
      };
      // Queue transport failure is retryable and no provider attempt has been
      // made. Keep the durable job pending so a later idempotent submission can
      // safely dispatch it again rather than permanently trapping it in failed.
      return this.store.update(persisted.id, {
        state: "pending",
        failure,
        completedAt: undefined,
      });
    }
  }
}

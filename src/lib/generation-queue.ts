import type { GenerationJobRecord } from "./generation-job";
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
    if (existing) return existing;
    if (request.job.state !== "pending") {
      throw new Error("Queueable generation jobs must be created in pending state.");
    }

    await this.store.create(request.job);
    const queued: GenerationJobUpdate = { state: "queued" };
    const persisted = await this.store.update(request.job.id, queued);

    try {
      await this.queue.send({
        generationJobId: persisted.id,
        idempotencyKey: persisted.idempotencyKey,
      });
      return persisted;
    } catch (error) {
      const failure: GenerationFailure = {
        code: "queue_dispatch_failed",
        retryable: true,
        message: error instanceof Error ? error.message : "Generation queue dispatch failed.",
      };
      return this.store.update(persisted.id, {
        state: "failed",
        failure,
        completedAt: this.now(),
      });
    }
  }
}

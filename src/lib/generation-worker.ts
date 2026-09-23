import { GenerationOrchestrator, type GenerationJobStore } from "./generation-orchestrator";
import type { GenerationProvider } from "./generation-provider";
import type { GenerationQueueMessage } from "./generation-queue";

export interface GenerationProviderResolver {
  resolve(providerKey?: string): GenerationProvider;
}

export class GenerationRetryRequested extends Error {
  constructor() {
    super("Generation job requeued for a bounded retry.");
    this.name = "GenerationRetryRequested";
  }
}

export class GenerationWorker {
  constructor(
    private readonly store: GenerationJobStore,
    private readonly providers: GenerationProviderResolver,
  ) {}

  async handle(message: GenerationQueueMessage) {
    const job = await this.store.findByIdempotencyKey(message.idempotencyKey);
    if (!job || job.id !== message.generationJobId) {
      throw new Error("Generation job not found for queue message.");
    }

    // Queue payloads carry identity only. The persisted D1 request is authoritative.
    if (!job.specification || !job.strategy) {
      throw new Error("Generation job request is not persisted.");
    }

    if (job.state !== "queued" && job.state !== "running") return job;

    const provider = this.providers.resolve(job.strategy.providerKey);
    const orchestrator = new GenerationOrchestrator(this.store, provider);
    const outcome = await orchestrator.process({
      job,
      specification: job.specification,
      strategy: job.strategy,
    });

    const maxAttempts = Math.max(1, job.strategy.maxAttempts);
    if (
      outcome.job.state === "failed" &&
      outcome.job.failure?.retryable &&
      !outcome.job.providerJobId &&
      outcome.job.attempt + 1 < maxAttempts
    ) {
      await this.store.update(job.id, {
        state: "queued",
        attempt: outcome.job.attempt + 1,
        failure: undefined,
        completedAt: undefined,
      });
      throw new GenerationRetryRequested();
    }

    return outcome.job;
  }
}

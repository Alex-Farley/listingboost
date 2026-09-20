import { GenerationOrchestrator, type GenerationJobStore } from "./generation-orchestrator";
import type { GenerationProvider } from "./generation-provider";
import type { GenerationQueueMessage } from "./generation-queue";

export interface GenerationProviderResolver {
  resolve(providerKey?: string): GenerationProvider;
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
    return (await orchestrator.reconcile(job)).job;
  }
}

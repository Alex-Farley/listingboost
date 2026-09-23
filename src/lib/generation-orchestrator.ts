import type {
  AssetSpecification,
  GenerationFailure,
  GenerationProvider,
  GenerationResult,
  GenerationState,
  GenerationStrategy,
} from "./generation-provider";
import { validateGenerationRequest } from "./generation-provider";
import { assertGenerationTransition, type GenerationJobRecord } from "./generation-job";

export type GenerationJobUpdate = {
  state?: GenerationState;
  attempt?: number;
  providerKey?: string;
  providerModel?: string;
  providerJobId?: string;
  providerRequestId?: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  failure?: GenerationFailure;
  startedAt?: string;
  completedAt?: string;
};

export interface GenerationJobStore {
  findByIdempotencyKey(idempotencyKey: string): Promise<GenerationJobRecord | null>;
  create(job: GenerationJobRecord): Promise<void>;
  update(id: string, update: GenerationJobUpdate): Promise<GenerationJobRecord>;
}

export type GenerationRequest = {
  job: GenerationJobRecord;
  specification: AssetSpecification;
  strategy: GenerationStrategy;
};

export type GenerationOutcome = {
  job: GenerationJobRecord;
  result?: GenerationResult;
};

export interface GenerationClock {
  now(): string;
}

const systemClock: GenerationClock = { now: () => new Date().toISOString() };

function transitionUpdate(
  job: GenerationJobRecord,
  next: GenerationState,
  update: GenerationJobUpdate = {},
): GenerationJobUpdate {
  assertGenerationTransition(job.state, next);
  return { ...update, state: next };
}

function resultUpdate(result: GenerationResult): GenerationJobUpdate {
  return {
    estimatedCostUsd: result.estimatedCostUsd,
    actualCostUsd: result.actualCostUsd,
    providerJobId: result.provenance?.providerJobId,
    providerRequestId: result.provenance?.providerRequestId,
    providerModel: result.provenance?.providerModel,
    ...(result.failure ? { failure: result.failure } : {}),
  };
}

export class GenerationOrchestrator {
  constructor(
    private readonly store: GenerationJobStore,
    private readonly provider: GenerationProvider,
    private readonly clock: GenerationClock = systemClock,
  ) {}

  async start(request: GenerationRequest): Promise<GenerationOutcome> {
    const existing = await this.store.findByIdempotencyKey(request.job.idempotencyKey);
    if (existing) return { job: existing };

    if (request.job.state !== "pending") {
      throw new Error("Generation jobs must be created in pending state.");
    }

    validateGenerationRequest(this.provider, request.specification, request.strategy);
    await this.store.create(request.job);
    const queued = await this.store.update(
      request.job.id,
      transitionUpdate(request.job, "queued"),
    );
    return this.submit(queued, request.specification, request.strategy);
  }

  async process(request: GenerationRequest): Promise<GenerationOutcome> {
    const existing = await this.store.findByIdempotencyKey(request.job.idempotencyKey);
    if (!existing) return this.start(request);

    if (existing.state !== "queued" && existing.state !== "running") {
      return { job: existing };
    }

    if (existing.providerJobId) return this.reconcile(existing);

    if (existing.state !== "queued") {
      throw new Error("Running generation jobs must have a provider job ID.");
    }

    validateGenerationRequest(this.provider, request.specification, request.strategy);
    return this.submit(existing, request.specification, request.strategy);
  }

  private async submit(
    job: GenerationJobRecord,
    specification: AssetSpecification,
    strategy: GenerationStrategy,
  ): Promise<GenerationOutcome> {
    let submission;
    try {
      submission = await this.provider.submit(
        specification,
        strategy,
        job.idempotencyKey,
      );
    } catch (error) {
      const failure: GenerationFailure = {
        code: "provider_submission_failed",
        retryable: true,
        message: error instanceof Error ? error.message : "Provider submission failed.",
      };
      return {
        job: await this.store.update(
          job.id,
          transitionUpdate(job, "failed", { failure, completedAt: this.clock.now() }),
        ),
      };
    }

    const submissionUpdate: GenerationJobUpdate = {
      providerKey: this.provider.providerKey,
      providerModel: strategy.modelKey,
      providerJobId: submission.providerJobId,
      estimatedCostUsd: submission.estimatedCostUsd,
      providerRequestId: submission.provenance?.providerRequestId,
    };

    if (submission.state === "running") {
      return {
        job: await this.store.update(
          job.id,
          transitionUpdate(job, "running", { ...submissionUpdate, startedAt: this.clock.now() }),
        ),
      };
    }

    if (submission.state === "succeeded") {
      try {
        const result = await this.provider.getStatus(submission.providerJobId);
        if (result.state === "queued") {
          return { job: await this.store.update(job.id, { ...submissionUpdate, ...resultUpdate(result) }), result };
        }

        const terminal = result.state === "succeeded" || result.state === "failed" || result.state === "cancelled";
        const next = await this.store.update(
          job.id,
          transitionUpdate(job, result.state, {
            ...submissionUpdate,
            ...resultUpdate(result),
            ...(result.state === "running" ? { startedAt: this.clock.now() } : {}),
            ...(terminal ? { completedAt: this.clock.now() } : {}),
          }),
        );
        return { job: next, result };
      } catch (error) {
        const failure: GenerationFailure = {
          code: "provider_status_failed",
          retryable: true,
          message: error instanceof Error ? error.message : "Provider status lookup failed.",
        };
        return {
          job: await this.store.update(
            job.id,
            transitionUpdate(job, "failed", { ...submissionUpdate, failure, completedAt: this.clock.now() }),
          ),
        };
      }
    }

    return { job: await this.store.update(job.id, submissionUpdate) };
  }

  async reconcile(job: GenerationJobRecord): Promise<GenerationOutcome> {
    if (!job.providerJobId) throw new Error("Generation job has no provider job ID.");
    if (job.state !== "queued" && job.state !== "running") return { job };

    try {
      const result = await this.provider.getStatus(job.providerJobId);
      if (result.state === job.state) {
        return { job: await this.store.update(job.id, resultUpdate(result)), result };
      }

      const terminal = result.state === "succeeded" || result.state === "failed" || result.state === "cancelled";
      const next = await this.store.update(
        job.id,
        transitionUpdate(job, result.state, {
          ...resultUpdate(result),
          ...(result.state === "running" ? { startedAt: this.clock.now() } : {}),
          ...(terminal ? { completedAt: this.clock.now() } : {}),
        }),
      );
      return { job: next, result };
    } catch (error) {
      const failure: GenerationFailure = {
        code: "provider_status_failed",
        retryable: true,
        message: error instanceof Error ? error.message : "Provider status lookup failed.",
      };
      return {
        job: await this.store.update(
          job.id,
          transitionUpdate(job, "failed", { failure, completedAt: this.clock.now() }),
        ),
      };
    }
  }
}

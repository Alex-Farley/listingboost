import type { AssetSpecification, GenerationFailure, GenerationState, GenerationStrategy, ProviderProvenance } from "./generation-provider";

export type PersistedGenerationState = GenerationState;

export type GenerationJobRecord = {
  id: string;
  campaignId: string;
  campaignAssetId: string;
  assetKey: string;
  state: PersistedGenerationState;
  attempt: number;
  idempotencyKey: string;
  specification?: AssetSpecification;
  strategy?: GenerationStrategy;
  providerKey?: string;
  providerModel?: string;
  providerJobId?: string;
  providerRequestId?: string;
  promptVersion?: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  failure?: GenerationFailure;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

export function generationFailureFromRow(row: Record<string, unknown>): GenerationFailure | undefined {
  if (typeof row.failure_code !== "string" || typeof row.failure_message !== "string") return undefined;
  return {
    code: row.failure_code,
    message: row.failure_message,
    retryable: row.failure_retryable === 1,
  };
}

export function generationProvenanceFromRow(row: Record<string, unknown>): ProviderProvenance | undefined {
  const provenance: ProviderProvenance = {};
  if (typeof row.provider_job_id === "string") provenance.providerJobId = row.provider_job_id;
  if (typeof row.provider_request_id === "string") provenance.providerRequestId = row.provider_request_id;
  if (typeof row.provider_model === "string") provenance.providerModel = row.provider_model;
  if (typeof row.provider_job_set_id === "string") provenance.providerJobSetId = row.provider_job_set_id;
  return Object.keys(provenance).length ? provenance : undefined;
}

export function assertGenerationTransition(current: GenerationState, next: GenerationState): void {
  const allowed: Record<GenerationState, readonly GenerationState[]> = {
    pending: ["queued", "cancelled", "failed"],
    queued: ["running", "succeeded", "failed", "cancelled"],
    running: ["succeeded", "failed", "cancelled"],
    succeeded: [],
    failed: ["queued", "cancelled"],
    cancelled: [],
  };
  if (!allowed[current].includes(next)) {
    throw new Error(`Invalid generation transition: ${current} -> ${next}`);
  }
}

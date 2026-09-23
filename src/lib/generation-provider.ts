export type AssetKind = "image" | "video";

export type AspectRatio =
  | "1:1"
  | "4:5"
  | "9:16"
  | "16:9"
  | "3:2"
  | "2:3"
  | "4:3"
  | "3:4"
  | "5:4"
  | "21:9";

export type Resolution = "480p" | "720p" | "1080p" | "1k" | "2k" | "4k";

export type AssetReference = {
  id: string;
  kind: "image" | "video" | "audio";
  role: "reference" | "start" | "end" | "audio";
};

export type AssetSpecification = {
  id: string;
  kind: AssetKind;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  durationSeconds?: number;
  references: AssetReference[];
  audio?: { enabled: boolean };
  outputCount: 1;
};

export type GenerationStrategy = {
  specificationId: string;
  providerKey: string;
  modelKey: string;
  estimatedCostUsd?: number;
  maxAttempts: number;
};

/**
 * Provider capabilities are infrastructure facts, not customer-facing product
 * configuration. They let ListingBoost validate a strategy against a provider
 * without leaking provider-specific concepts into the campaign domain.
 */
export type GenerationProviderCapabilities = {
  modelKeys: readonly string[];
  assetKinds: readonly AssetKind[];
  aspectRatios: readonly AspectRatio[];
  resolutions: readonly Resolution[];
  referenceKinds: readonly AssetReference["kind"][];
  referenceRoles: readonly AssetReference["role"][];
  audio: boolean;
  maxDurationSeconds?: number;
};

export type GenerationState =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type GenerationFailure = {
  code: string;
  retryable: boolean;
  message: string;
};

export type ProviderProvenance = {
  providerJobId?: string;
  providerJobSetId?: string;
  providerModel?: string;
  providerRequestId?: string;
};

export type GenerationResult = {
  state: GenerationState;
  outputs: Array<{
    mediaId: string;
    kind: AssetKind;
    contentType: string;
    sourceUrl?: string;
  }>;
  provenance?: ProviderProvenance;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  failure?: GenerationFailure;
};

export interface GenerationProvider {
  readonly providerKey: string;
  readonly capabilities?: GenerationProviderCapabilities;

  submit(
    specification: AssetSpecification,
    strategy: GenerationStrategy,
    idempotencyKey: string,
  ): Promise<ProviderSubmission>;

  getStatus(providerJobId: string): Promise<GenerationResult>;

  cancel?(providerJobId: string): Promise<void>;
}

export type ProviderSubmission = {
  providerJobId: string;
  state: "queued" | "running" | "succeeded";
  provenance?: ProviderProvenance;
  estimatedCostUsd?: number;
};

/**
 * Validate a provider strategy before a job is persisted or submitted.
 * Provider implementations can expose capabilities without forcing those
 * details into ListingBoost's campaign/domain model. Providers that cannot
 * publish a capability catalogue yet may omit `capabilities` and remain
 * compatible with the contract.
 */
export function validateGenerationRequest(
  provider: Pick<GenerationProvider, "providerKey" | "capabilities">,
  specification: AssetSpecification,
  strategy: GenerationStrategy,
): void {
  if (strategy.providerKey !== provider.providerKey) {
    throw new Error(`Generation strategy targets provider ${strategy.providerKey}, but resolved provider is ${provider.providerKey}.`);
  }
  if (strategy.specificationId !== specification.id) {
    throw new Error(`Generation strategy ${strategy.specificationId} does not match specification ${specification.id}.`);
  }
  if (!Number.isInteger(strategy.maxAttempts) || strategy.maxAttempts < 1) {
    throw new Error("Generation strategy maxAttempts must be a positive integer.");
  }
  if (strategy.estimatedCostUsd !== undefined && (!Number.isFinite(strategy.estimatedCostUsd) || strategy.estimatedCostUsd < 0)) {
    throw new Error("Generation strategy estimatedCostUsd must be a non-negative finite number.");
  }

  const capabilities = provider.capabilities;
  if (!capabilities) return;

  if (!capabilities.modelKeys.includes(strategy.modelKey)) {
    throw new Error(`Provider ${provider.providerKey} does not support model ${strategy.modelKey}.`);
  }
  if (!capabilities.assetKinds.includes(specification.kind)) {
    throw new Error(`Provider ${provider.providerKey} does not support ${specification.kind} assets.`);
  }
  if (!capabilities.aspectRatios.includes(specification.aspectRatio)) {
    throw new Error(`Provider ${provider.providerKey} does not support ${specification.aspectRatio} assets.`);
  }
  if (!capabilities.resolutions.includes(specification.resolution)) {
    throw new Error(`Provider ${provider.providerKey} does not support ${specification.resolution} assets.`);
  }
  if (specification.audio?.enabled && !capabilities.audio) {
    throw new Error(`Provider ${provider.providerKey} does not support audio output.`);
  }
  if (capabilities.maxDurationSeconds !== undefined && specification.durationSeconds !== undefined && specification.durationSeconds > capabilities.maxDurationSeconds) {
    throw new Error(`Provider ${provider.providerKey} does not support ${specification.durationSeconds}s assets.`);
  }
  for (const reference of specification.references) {
    if (!capabilities.referenceKinds.includes(reference.kind)) {
      throw new Error(`Provider ${provider.providerKey} does not support ${reference.kind} references.`);
    }
    if (!capabilities.referenceRoles.includes(reference.role)) {
      throw new Error(`Provider ${provider.providerKey} does not support ${reference.role} references.`);
    }
  }
}

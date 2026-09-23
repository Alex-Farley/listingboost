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

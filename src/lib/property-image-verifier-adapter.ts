import type {
  MaterialFeature,
  PropertyImageTreatment,
  PropertyImageVerificationReport,
} from "@/lib/property-image-verification";

export type PropertyImageVerificationMedia = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

export type PropertyImageVerifierRequest = {
  source: PropertyImageVerificationMedia;
  output: PropertyImageVerificationMedia;
  treatment: PropertyImageTreatment;
  sourceSha256: string;
  outputSha256: string;
};

export type PropertyImageVerifier = {
  readonly engine: string;
  readonly version: string;
  verify(request: PropertyImageVerifierRequest): Promise<PropertyImageVerificationReport>;
};

/**
 * Safe default for environments where an independent CV engine has not been
 * provisioned. It deliberately never approves an enhancement. A real CV
 * implementation must be injected behind this interface and must be
 * independent of the generation provider.
 */
export const manualReviewPropertyImageVerifier: PropertyImageVerifier = {
  engine: "manual-review-required",
  version: "1.0.0",
  async verify({ source, output, treatment, sourceSha256, outputSha256 }) {
    const emptyFeatures: MaterialFeature[] = [];
    return {
      policyVersion: "2026-09-24",
      treatment,
      verifier: {
        engine: "independent-layout-verifier",
        version: "manual-review-required@1.0.0",
        independentOfGenerationProvider: true,
      },
      sourceSha256,
      outputSha256,
      sourceDimensions: { width: source.width, height: source.height },
      outputDimensions: { width: output.width, height: output.height },
      sourceFeatures: emptyFeatures,
      outputFeatures: emptyFeatures,
      structuralSimilarity: 0,
      status: "manual-review",
      reasons: [
        "No independent computer-vision verifier is provisioned; enhancement publication remains fail-closed.",
      ],
    };
  },
};

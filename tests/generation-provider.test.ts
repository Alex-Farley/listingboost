import { describe, expect, test } from "bun:test";
import type { AssetSpecification, GenerationProvider, GenerationStrategy } from "../src/lib/generation-provider";
import { validateGenerationRequest } from "../src/lib/generation-provider";

const specification: AssetSpecification = {
  id: "asset-hero",
  kind: "image",
  aspectRatio: "4:5",
  resolution: "2k",
  references: [{ id: "photo-1", kind: "image", role: "reference" }],
  outputCount: 1,
};

const strategy: GenerationStrategy = {
  specificationId: specification.id,
  providerKey: "fake",
  modelKey: "image-v1",
  maxAttempts: 2,
  estimatedCostUsd: 0.2,
};

const provider: GenerationProvider = {
  providerKey: "fake",
  capabilities: {
    modelKeys: ["image-v1"],
    assetKinds: ["image"],
    aspectRatios: ["4:5"],
    resolutions: ["2k"],
    referenceKinds: ["image"],
    referenceRoles: ["reference"],
    audio: false,
  },
  async submit() {
    return { providerJobId: "job", state: "queued" };
  },
  async getStatus() {
    return { state: "queued", outputs: [] };
  },
};

describe("provider-neutral generation boundary", () => {
  test("domain specifications contain no provider-specific customer concepts", () => {
    expect(specification).not.toHaveProperty("provider");
    expect(specification).not.toHaveProperty("model");
    expect(strategy.specificationId).toBe(specification.id);
  });

  test("accepts a strategy supported by provider capabilities", () => {
    expect(() => validateGenerationRequest(provider, specification, strategy)).not.toThrow();
  });

  test("rejects a strategy for a different provider", () => {
    expect(() => validateGenerationRequest(provider, specification, { ...strategy, providerKey: "other" })).toThrow(
      "resolved provider is fake",
    );
  });

  test("rejects an unsupported model before submission", () => {
    expect(() => validateGenerationRequest(provider, specification, { ...strategy, modelKey: "unknown" })).toThrow(
      "does not support model unknown",
    );
  });

  test("rejects unsupported output constraints", () => {
    expect(() => validateGenerationRequest(provider, { ...specification, resolution: "4k" }, strategy)).toThrow(
      "does not support 4k assets",
    );
  });

  test("rejects invalid retry and cost configuration", () => {
    expect(() => validateGenerationRequest(provider, specification, { ...strategy, maxAttempts: 0 })).toThrow(
      "maxAttempts must be a positive integer",
    );
    expect(() => validateGenerationRequest(provider, specification, { ...strategy, estimatedCostUsd: -1 })).toThrow(
      "estimatedCostUsd must be a non-negative finite number",
    );
  });

  test("allows providers without a capability catalogue while enforcing contract invariants", () => {
    const providerWithoutCapabilities: GenerationProvider = { ...provider, capabilities: undefined };
    expect(() => validateGenerationRequest(providerWithoutCapabilities, specification, strategy)).not.toThrow();
  });
});

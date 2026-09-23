import { describe, expect, it } from "bun:test";
import { GenerationProviderRegistry } from "../src/lib/generation-provider-registry";
import type { AssetSpecification, GenerationProvider, GenerationStrategy } from "../src/lib/generation-provider";

function provider(providerKey: string): GenerationProvider {
  return {
    providerKey,
    async submit() {
      return { providerJobId: "job", state: "queued" };
    },
    async getStatus() {
      return { state: "queued", outputs: [] };
    },
  };
}

const specification: AssetSpecification = {
  id: "hero",
  kind: "image",
  aspectRatio: "4:5",
  resolution: "2k",
  references: [{ id: "ref-1", kind: "image", role: "reference" }],
  outputCount: 1,
};

const strategy: GenerationStrategy = {
  specificationId: "hero",
  providerKey: "fake",
  modelKey: "model",
  maxAttempts: 1,
};

const capableProvider = (): GenerationProvider => ({
  ...provider("fake"),
  capabilities: {
    assetKinds: ["image"],
    aspectRatios: ["4:5"],
    resolutions: ["2k"],
    referenceKinds: ["image"],
    referenceRoles: ["reference"],
    audio: false,
  },
});

describe("GenerationProviderRegistry", () => {
  it("resolves providers by their ListingBoost provider key", () => {
    const fake = provider("fake");
    const registry = new GenerationProviderRegistry([fake]);

    expect(registry.resolve("fake")).toBe(fake);
  });

  it("rejects duplicate provider keys", () => {
    expect(() => new GenerationProviderRegistry([provider("fake"), provider("fake")])).toThrow(
      "Generation provider keys must be unique.",
    );
  });

  it("rejects unknown providers instead of silently falling back", () => {
    const registry = new GenerationProviderRegistry([provider("fake")]);

    expect(() => registry.resolve("missing")).toThrow(
      "Generation provider is not configured: missing",
    );
  });

  it("rejects blank provider keys", () => {
    expect(() => new GenerationProviderRegistry([provider("   ")])).toThrow(
      "Generation provider keys must be non-empty.",
    );
  });

  it("resolves a provider when its declared capabilities satisfy the specification", () => {
    const fake = capableProvider();
    const registry = new GenerationProviderRegistry([fake]);

    expect(registry.resolveFor(specification, strategy)).toBe(fake);
  });

  it("rejects a strategy when the provider cannot satisfy the specification", () => {
    const fake = capableProvider();
    fake.capabilities = { ...fake.capabilities!, resolutions: ["1080p"] };
    const registry = new GenerationProviderRegistry([fake]);

    expect(() => registry.resolveFor(specification, strategy)).toThrow(
      "Generation provider cannot satisfy specification: fake",
    );
  });

  it("rejects capability selection for providers without a declared capability contract", () => {
    const registry = new GenerationProviderRegistry([provider("fake")]);

    expect(() => registry.resolveFor(specification, strategy)).toThrow(
      "Generation provider has no declared capabilities: fake",
    );
  });
});

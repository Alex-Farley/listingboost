import { describe, expect, it } from "bun:test";
import { GenerationProviderRegistry } from "../src/lib/generation-provider-registry";
import type { GenerationProvider } from "../src/lib/generation-provider";

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
});

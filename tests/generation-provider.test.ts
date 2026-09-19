import { describe, expect, test } from "bun:test";
import type {
  AssetSpecification,
  GenerationProvider,
  GenerationStrategy,
} from "../src/lib/generation-provider";

describe("provider-neutral generation boundary", () => {
  test("domain specifications contain no provider-specific customer concepts", () => {
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
      providerKey: "higgsfield",
      modelKey: "nano_banana_2",
      maxAttempts: 2,
    };

    const fakeProvider: GenerationProvider = {
      providerKey: strategy.providerKey,
      async submit() {
        return { providerJobId: "fake-job", state: "queued" };
      },
      async getStatus() {
        return {
          state: "succeeded",
          outputs: [],
        };
      },
    };

    expect(specification).not.toHaveProperty("provider");
    expect(specification).not.toHaveProperty("model");
    expect(strategy.specificationId).toBe(specification.id);
    expect(fakeProvider.providerKey).toBe("higgsfield");
  });
});

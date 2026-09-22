import type { GenerationProvider } from "./generation-provider";

/**
 * Resolves provider adapters by their ListingBoost-owned provider key.
 *
 * Provider keys are infrastructure identifiers only. They are selected by
 * server-side generation strategy and never exposed as customer identity.
 */
export class GenerationProviderRegistry {
  private readonly providers: ReadonlyMap<string, GenerationProvider>;

  constructor(providers: readonly GenerationProvider[]) {
    const entries = providers.map((provider) => [provider.providerKey, provider] as const);
    if (entries.some(([key]) => !key.trim())) {
      throw new Error("Generation provider keys must be non-empty.");
    }

    const registry = new Map(entries);
    if (registry.size !== entries.length) {
      throw new Error("Generation provider keys must be unique.");
    }
    this.providers = registry;
  }

  resolve(providerKey: string): GenerationProvider {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(`Generation provider is not configured: ${providerKey}`);
    }
    return provider;
  }
}

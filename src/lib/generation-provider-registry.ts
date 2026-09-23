import type { AssetSpecification, GenerationProvider, GenerationStrategy } from "./generation-provider";

function supportsSpecification(provider: GenerationProvider, specification: AssetSpecification): boolean {
  const capabilities = provider.capabilities;
  if (!capabilities) return false;

  if (!capabilities.assetKinds.includes(specification.kind)) return false;
  if (!capabilities.aspectRatios.includes(specification.aspectRatio)) return false;
  if (!capabilities.resolutions.includes(specification.resolution)) return false;
  if (specification.audio?.enabled && !capabilities.audio) return false;
  if (
    specification.durationSeconds !== undefined &&
    capabilities.maxDurationSeconds !== undefined &&
    specification.durationSeconds > capabilities.maxDurationSeconds
  ) {
    return false;
  }

  return specification.references.every(
    (reference) =>
      capabilities.referenceKinds.includes(reference.kind) &&
      capabilities.referenceRoles.includes(reference.role),
  );
}

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

  resolveFor(
    specification: AssetSpecification,
    strategy: GenerationStrategy,
  ): GenerationProvider {
    const provider = this.resolve(strategy.providerKey);
    if (!provider.capabilities) {
      throw new Error(`Generation provider has no declared capabilities: ${provider.providerKey}`);
    }
    if (!supportsSpecification(provider, specification)) {
      throw new Error(
        `Generation provider cannot satisfy specification: ${provider.providerKey}`,
      );
    }
    return provider;
  }
}

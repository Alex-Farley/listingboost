import { createServerFnf } from "./fnf.server";

type LegacyMedia = { id?: string; type?: string };
type LegacyGeneration = {
  id?: string;
  type?: string;
  status?: string;
  results?: Record<string, unknown>;
};

/**
 * Temporary compatibility adapter for the legacy FNF-hosted prototype.
 *
 * Product/domain code must not depend on FNF directly. This module is the
 * explicit boundary for legacy media/generation reads while ListingBoost's
 * owned media and provider-neutral generation paths replace them.
 */
export function createLegacyFnfProviderAdapter() {
  const adapter = createServerFnf().adapter;
  return {
    getMedia(input: { id: string; type: "image" | "video" }) {
      return adapter.getMedia(input) as Promise<LegacyMedia>;
    },
    getJob(id: string) {
      return adapter.getJob(id) as Promise<LegacyGeneration>;
    },
  };
}

export type LegacyFnfProviderAdapter = ReturnType<typeof createLegacyFnfProviderAdapter>;

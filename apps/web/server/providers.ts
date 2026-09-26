import { FactCopywriter, type ProviderRegistry } from "@listingboost/ai";

/**
 * Provider adapters registered in deployed Workers. Only real implementations
 * belong here; unregistered capabilities are reported as unavailable (D-012).
 * Image enhancement, graphics rendering and video await OD-1..OD-3 / R7b-c.
 */
export const PRODUCTION_PROVIDERS: ProviderRegistry = {
  text_generation: new FactCopywriter(),
};

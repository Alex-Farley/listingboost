import type { AppEnv } from "./bindings.server";
import { createD1GenerationJobStore } from "./generation-job-store.server";
import { GenerationProviderRegistry } from "./generation-provider-registry";
import type { GenerationProvider } from "./generation-provider";
import { GenerationWorker } from "./generation-worker";
import { createR2GenerationOutputStore } from "./r2-generation-output-store.server";

/**
 * Build the durable generation worker from ListingBoost-owned runtime
 * dependencies. Providers are injected rather than imported here so the
 * Worker entrypoint stays independent of any provider SDK or account model.
 */
export function createGenerationWorker(
  environment: AppEnv,
  providers: readonly GenerationProvider[] = [],
): GenerationWorker {
  if (!environment.DB) {
    throw new Error("Generation worker requires a configured D1 database.");
  }

  const outputs = environment.STORAGE
    ? createR2GenerationOutputStore(environment.DB, environment.STORAGE)
    : undefined;

  return new GenerationWorker(
    createD1GenerationJobStore(environment.DB),
    new GenerationProviderRegistry(providers),
    outputs,
  );
}

import type { GenerationJobRecord } from "./generation-job";
import type { GenerationResult } from "./generation-provider";

export type GenerationOutputRecord = {
  campaignId: string;
  campaignAssetId: string;
  assetKey: string;
  providerKey?: string;
  providerMediaId: string;
  kind: "image" | "video";
  contentType: string;
  sourceUrl?: string;
};

/**
 * Provider-neutral sink for completed generation outputs.
 *
 * The worker owns the lifecycle boundary; storage remains an injected concern
 * so R2 (or a future storage implementation) does not become part of the
 * provider contract.
 */
export interface GenerationOutputStore {
  persist(job: GenerationJobRecord, result: GenerationResult): Promise<void>;
}

export function generationOutputRecords(
  job: GenerationJobRecord,
  result: GenerationResult,
): GenerationOutputRecord[] {
  const providerKey = job.strategy?.providerKey ?? job.providerKey;
  return result.outputs.map((output) => ({
    campaignId: job.campaignId,
    campaignAssetId: job.campaignAssetId,
    assetKey: job.assetKey,
    ...(providerKey ? { providerKey } : {}),
    providerMediaId: output.mediaId,
    kind: output.kind,
    contentType: output.contentType,
    ...(output.sourceUrl ? { sourceUrl: output.sourceUrl } : {}),
  }));
}

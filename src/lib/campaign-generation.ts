import type { GenerationState } from "./generation-provider";

export function buildGenerationJobIdempotencyKey(
  campaignAssetId: string,
  assetKey: string,
  attempt = 0,
): string {
  if (!campaignAssetId || !assetKey) throw new Error("Campaign asset identity is required.");
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("Generation attempt must be a non-negative integer.");
  return `${campaignAssetId}:${assetKey}:${attempt}`;
}

export function campaignAssetStatusFromGenerationState(state: GenerationState):
  "pending" | "generating" | "ready" | "failed" {
  switch (state) {
    case "pending":
    case "queued":
      return state === "pending" ? "pending" : "generating";
    case "running":
      return "generating";
    case "succeeded":
      return "ready";
    case "failed":
      return "failed";
    case "cancelled":
      return "failed";
  }
}

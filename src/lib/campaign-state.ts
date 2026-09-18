export const CAMPAIGN_STATES = [
  "draft",
  "planning",
  "generating",
  "partial",
  "ready",
  "failed",
  "cancelled",
] as const;

export type CampaignState = (typeof CAMPAIGN_STATES)[number];

export const CAMPAIGN_ASSET_STATES = [
  "queued",
  "generating",
  "ready",
  "failed",
  "cancelled",
] as const;

export type CampaignAssetState = (typeof CAMPAIGN_ASSET_STATES)[number];

const CAMPAIGN_TRANSITIONS: Record<CampaignState, readonly CampaignState[]> = {
  draft: ["planning", "cancelled"],
  planning: ["generating", "failed", "cancelled"],
  generating: ["partial", "ready", "failed", "cancelled"],
  partial: ["generating", "ready", "failed", "cancelled"],
  ready: ["planning", "generating", "cancelled"],
  failed: ["planning", "generating", "cancelled"],
  cancelled: ["planning"],
};

export function normalizeCampaignState(value: string): CampaignState {
  if (value === "building") return "draft";
  if (value === "error") return "failed";
  if ((CAMPAIGN_STATES as readonly string[]).includes(value)) return value as CampaignState;
  throw new Error("Unknown campaign state: " + value);
}

export function canTransitionCampaign(from: CampaignState, to: CampaignState): boolean {
  return from === to || CAMPAIGN_TRANSITIONS[from].includes(to);
}

export function assertCampaignTransition(fromValue: string, to: CampaignState): void {
  const from = normalizeCampaignState(fromValue);
  if (!canTransitionCampaign(from, to)) {
    throw new Error("Invalid campaign state transition: " + from + " -> " + to);
  }
}

export function deriveCampaignState(assetStates: readonly CampaignAssetState[]): CampaignState {
  if (assetStates.length === 0) return "planning";
  const ready = assetStates.filter((state) => state === "ready").length;
  const failed = assetStates.filter((state) => state === "failed").length;
  const active = assetStates.some((state) => state === "queued" || state === "generating");
  if (ready === assetStates.length) return "ready";
  if (failed === assetStates.length) return "failed";
  if (ready > 0 && failed > 0 && !active) return "partial";
  return "generating";
}

export function normalizeCampaignAssetState(value: string): CampaignAssetState {
  if ((CAMPAIGN_ASSET_STATES as readonly string[]).includes(value)) return value as CampaignAssetState;
  if (value === "completed") return "ready";
  if (["failed", "error", "nsfw", "ip_detected"].includes(value)) return "failed";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  return "generating";
}

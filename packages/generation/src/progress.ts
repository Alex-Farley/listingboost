import { selectFinalVersion, type AssetType, type AssetVersionState, type CampaignStatus } from "@listingboost/domain";

type ProgressVersion = { id: string; versionNumber: number; state: AssetVersionState; approvedAt: string | null };
export type ProgressAsset = { assetType: AssetType; available: boolean; versions: ProgressVersion[] };

export type ProgressStatus = "complete" | "not_started" | "in_progress" | "needs_review" | "approved" | "failed" | "unavailable";
export type ProgressGroup = { key: string; label: string; status: ProgressStatus };

const ACTIVE: ReadonlySet<AssetVersionState> = new Set(["queued", "processing", "completed"]);

const latest = (a: ProgressAsset) => a.versions.reduce<ProgressVersion | null>((m, v) => (!m || v.versionNumber > m.versionNumber ? v : m), null);
const hasFinal = (a: ProgressAsset) => selectFinalVersion(a.versions) !== null;

export function deriveCampaignStatus(assets: readonly ProgressAsset[]): CampaignStatus {
  if (assets.some((a) => ACTIVE.has(latest(a)?.state ?? "approved"))) return "generating";
  if (assets.length > 0 && assets.every(hasFinal)) return "completed";
  if (assets.some((a) => a.versions.length > 0)) return "in_review";
  return "draft";
}

function groupStatus(assets: readonly ProgressAsset[]): ProgressStatus {
  if (assets.length === 0) return "not_started";
  if (assets.every((a) => a.versions.length === 0)) return assets.every((a) => !a.available) ? "unavailable" : "not_started";
  if (assets.some((a) => ACTIVE.has(latest(a)?.state ?? "approved"))) return "in_progress";
  if (assets.every(hasFinal)) return "approved";
  if (assets.some((a) => !hasFinal(a) && (latest(a)?.state === "failed" || latest(a)?.state === "cancelled"))) return "failed";
  return "needs_review";
}

const GROUPS: Array<{ key: string; label: string; type: AssetType }> = [
  { key: "photography", label: "Enhanced images", type: "enhanced_photo" },
  { key: "social", label: "Social posts", type: "social_post" },
  { key: "stories", label: "Stories", type: "story" },
  { key: "reel", label: "Reel", type: "reel" },
  { key: "copy", label: "Social copy", type: "copy" },
];

export function campaignProgress(assets: readonly ProgressAsset[]): ProgressGroup[] {
  const status = deriveCampaignStatus(assets);
  return [
    { key: "property", label: "Property information", status: "complete" },
    ...GROUPS.map((g) => ({ key: g.key, label: g.label, status: groupStatus(assets.filter((a) => a.assetType === g.type)) })),
    {
      key: "pack",
      label: "Marketing pack",
      status: status === "completed" ? "complete" : assets.some(hasFinal) ? "in_progress" : "not_started",
    },
  ];
}

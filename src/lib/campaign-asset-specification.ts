import type { AssetKind, AssetReference, AspectRatio, Resolution } from "./generation-provider";

/**
 * Stable product-level identities for the launch campaign. These keys are
 * intentionally independent of provider/model identifiers and display titles.
 */
export type CampaignAssetKey =
  | "hero"
  | "square"
  | "story"
  | "just-listed"
  | "property-reel";

export type CampaignAssetPurpose =
  | "lead-property-creative"
  | "square-social-creative"
  | "vertical-story-creative"
  | "listing-launch-creative"
  | "property-reel";

export type CampaignPromptStrategy =
  | "property-hero"
  | "social-square"
  | "vertical-story"
  | "just-listed"
  | "property-reel";

export type CampaignAssetSpecification = {
  assetKey: CampaignAssetKey;
  kind: AssetKind;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  purpose: CampaignAssetPurpose;
  promptStrategy: CampaignPromptStrategy;
  references: AssetReference[];
  durationSeconds?: number;
  audio?: { enabled: boolean };
  outputCount: 1;
};

const IMAGE_ASSETS = [
  {
    assetKey: "hero",
    kind: "image",
    aspectRatio: "4:5",
    resolution: "2k",
    purpose: "lead-property-creative",
    promptStrategy: "property-hero",
  },
  {
    assetKey: "square",
    kind: "image",
    aspectRatio: "1:1",
    resolution: "2k",
    purpose: "square-social-creative",
    promptStrategy: "social-square",
  },
  {
    assetKey: "story",
    kind: "image",
    aspectRatio: "9:16",
    resolution: "2k",
    purpose: "vertical-story-creative",
    promptStrategy: "vertical-story",
  },
  {
    assetKey: "just-listed",
    kind: "image",
    aspectRatio: "4:5",
    resolution: "2k",
    purpose: "listing-launch-creative",
    promptStrategy: "just-listed",
  },
] as const;

/**
 * Build the product asset plan from ListingBoost-owned source-photo IDs.
 * Provider/model selection deliberately does not belong here.
 */
export function buildCampaignAssetSpecifications(
  sourceImageIds: readonly string[],
): CampaignAssetSpecification[] {
  if (sourceImageIds.length === 0 || sourceImageIds.length > 6) {
    throw new Error("A campaign requires between 1 and 6 source images.");
  }

  const references: AssetReference[] = sourceImageIds.map((id) => ({
    id,
    kind: "image",
    role: "reference",
  }));

  return [
    ...IMAGE_ASSETS.map((asset) => ({ ...asset, references, outputCount: 1 as const })),
    {
      assetKey: "property-reel" as const,
      kind: "video" as const,
      aspectRatio: "9:16" as const,
      resolution: "720p" as const,
      purpose: "property-reel" as const,
      promptStrategy: "property-reel" as const,
      references,
      durationSeconds: 5,
      audio: { enabled: true },
      outputCount: 1 as const,
    },
  ];
}

/**
 * Map the product specification into the existing provider-neutral generation
 * contract. The provider contract carries execution constraints; product
 * identity, purpose and prompt strategy remain owned by ListingBoost.
 */
export function toGenerationAssetSpecification(
  specification: CampaignAssetSpecification,
) {
  return {
    id: specification.assetKey,
    kind: specification.kind,
    aspectRatio: specification.aspectRatio,
    resolution: specification.resolution,
    references: specification.references,
    ...(specification.durationSeconds !== undefined
      ? { durationSeconds: specification.durationSeconds }
      : {}),
    ...(specification.audio ? { audio: specification.audio } : {}),
    outputCount: specification.outputCount,
  } as const;
}

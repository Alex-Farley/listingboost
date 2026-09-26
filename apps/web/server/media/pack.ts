import { selectFinalVersion, VISUALISATION_LABEL, type AssetType } from "@listingboost/domain";
import type { AssetRecord, VersionRecord } from "@listingboost/database";
import { extensionFor, slugify } from "./filenames";

export type PackEntry =
  | { path: string; kind: "object"; objectKey: string; version: VersionRecord; label: string }
  | { path: string; kind: "text"; content: string; version: VersionRecord; label: string };

const FOLDERS: Record<AssetType, string> = {
  enhanced_photo: "Photography",
  social_post: "Social",
  story: "Stories",
  reel: "Reels",
  copy: "Copy",
};

const LABELS: Record<AssetType, string> = {
  enhanced_photo: "Enhanced photograph",
  social_post: "Social post",
  story: "Story",
  reel: "Reel",
  copy: "Copy",
};

/** Lays out the final (most recently approved) version of every asset; nothing else is ever included. */
export function packEntries(propertyTitle: string, assets: readonly AssetRecord[]): PackEntry[] {
  const root = slugify(propertyTitle);
  const ordered = [...assets].sort((a, b) => a.sortOrder - b.sortOrder);
  let photoNumber = 0;
  const entries: PackEntry[] = [];
  for (const asset of ordered) {
    const version = selectFinalVersion(asset.versions);
    if (asset.assetType === "enhanced_photo") photoNumber++;
    if (!version) continue;
    const folder = `${root}/${FOLDERS[asset.assetType]}`;
    const slot = asset.slotKey.split(":")[1] ?? asset.slotKey;
    const label = `${LABELS[asset.assetType]} (version ${version.versionNumber})`;
    if (asset.assetType === "copy") {
      if (version.textContent === null) continue;
      entries.push({ path: `${folder}/${slugify(slot)}.txt`, kind: "text", content: `${version.textContent}\n`, version, label });
      continue;
    }
    if (!version.outputObjectKey || !version.outputContentType) continue;
    const name =
      asset.assetType === "enhanced_photo"
        ? `photo-${String(photoNumber).padStart(2, "0")}`
        : asset.assetType === "social_post"
          ? `social-${slugify(slot)}`
          : asset.assetType === "story"
            ? "story"
            : "reel";
    const suffix = version.treatment === "visualisation" ? "-visualisation" : "";
    entries.push({
      path: `${folder}/${root}-${name}${suffix}.${extensionFor(version.outputContentType)}`,
      kind: "object",
      objectKey: version.outputObjectKey,
      version,
      label,
    });
  }
  return entries;
}

export function packReadme(propertyTitle: string, entries: readonly PackEntry[], generatedAt: Date): string {
  const root = slugify(propertyTitle);
  const lines = [
    propertyTitle,
    `Marketing pack prepared by ListingBoost on ${generatedAt.toISOString().slice(0, 10)}.`,
    "",
    "Contents (approved versions only):",
    ...entries.map((e) => `- ${e.path.slice(root.length + 1)}: ${e.label}`),
    "",
    "We enhance the photograph. We never change the property.",
  ];
  if (entries.some((e) => e.version.treatment === "visualisation")) {
    lines.push(`Files ending in "-visualisation" are ${VISUALISATION_LABEL}. They must be published with that label.`);
  }
  return `${lines.join("\n")}\n`;
}

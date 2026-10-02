import type { AspectRatio, AssetType, BrandTemplateSlot, GenerationCapability } from "@listingboost/domain";
import { COPY_SLOTS, DEFAULT_TEMPLATES, type TemplateDefinition } from "./templates";

export type PlannedAsset = {
  slotKey: string;
  assetType: AssetType;
  aspectRatio: AspectRatio | null;
  sourceMediaId: string | null;
  templateId: string;
  templateVersion: number;
  capability: GenerationCapability;
  sortOrder: number;
};

export type PlanPhoto = { id: string; position: number; isPrimary: boolean };

function template(id: string): TemplateDefinition {
  const found = DEFAULT_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown template ${id}`);
  return found;
}

export function planCampaignAssets(photos: readonly PlanPhoto[]): PlannedAsset[] {
  if (photos.length === 0) throw new Error("A campaign needs at least one photo");
  const ordered = [...photos].sort((a, b) => a.position - b.position);
  const primary = ordered.find((p) => p.isPrimary) ?? ordered[0]!;

  const slots: Array<Omit<PlannedAsset, "sortOrder" | "templateVersion" | "capability" | "assetType" | "aspectRatio"> & { t: TemplateDefinition }> = [
    ...ordered.map((p) => ({ slotKey: `photo:${p.id}`, sourceMediaId: p.id, templateId: "enhanced-photo", t: template("enhanced-photo") })),
    { slotKey: "social:square", sourceMediaId: primary.id, templateId: "social-square", t: template("social-square") },
    { slotKey: "social:portrait", sourceMediaId: primary.id, templateId: "social-portrait", t: template("social-portrait") },
    { slotKey: "story:primary", sourceMediaId: primary.id, templateId: "story", t: template("story") },
    { slotKey: "reel:slideshow", sourceMediaId: null, templateId: "reel-slideshow", t: template("reel-slideshow") },
    ...COPY_SLOTS.map((slot) => {
      const id = `copy-${slot.replace(/_/g, "-")}`;
      return { slotKey: `copy:${slot}`, sourceMediaId: null, templateId: id, t: template(id) };
    }),
  ];

  return slots.map(({ t, ...slot }, sortOrder) => ({
    ...slot,
    assetType: t.assetType,
    aspectRatio: t.aspectRatio,
    templateVersion: t.version,
    capability: t.capability,
    sortOrder,
  }));
}

/** The graphic slots an organisation can choose a template for, and each slot's default. */
export const GRAPHIC_SLOTS: Record<BrandTemplateSlot, { label: string; assetType: AssetType; aspectRatio: AspectRatio; defaultTemplateId: string }> = {
  "social:square": { label: "Social post (square)", assetType: "social_post", aspectRatio: "1:1", defaultTemplateId: "social-square" },
  "social:portrait": { label: "Social post (portrait)", assetType: "social_post", aspectRatio: "4:5", defaultTemplateId: "social-portrait" },
  "story:primary": { label: "Story", assetType: "story", aspectRatio: "9:16", defaultTemplateId: "story" },
};

/** Templates an owner may choose for a slot: the newest version of each matching design. */
export function selectableTemplates(slot: BrandTemplateSlot): TemplateDefinition[] {
  const { assetType, aspectRatio } = GRAPHIC_SLOTS[slot];
  const newest = new Map<string, TemplateDefinition>();
  for (const t of DEFAULT_TEMPLATES) {
    if (t.assetType !== assetType || t.aspectRatio !== aspectRatio) continue;
    const current = newest.get(t.id);
    if (!current || t.version > current.version) newest.set(t.id, t);
  }
  return [...newest.values()];
}

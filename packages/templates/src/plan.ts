import { BRAND_TEMPLATE_SLOTS, type AspectRatio, type AssetType, type BrandTemplateSlot, type GenerationCapability, type PreferredTemplates } from "@listingboost/domain";
import { COPY_SLOTS, newestTemplate, TEMPLATE_CATALOGUE, type TemplateDefinition } from "./templates";

export type PlannedAsset = {
  slotKey: string;
  assetType: AssetType;
  aspectRatio: AspectRatio | null;
  sourceMediaId: string | null;
  templateId: string;
  templateVersion: number;
  capability: GenerationCapability;
  sortOrder: number;
  /** Set when the organisation's preferred template for this slot cannot be used. The asset is then never rendered. */
  unavailable: "template_unavailable" | null;
};

export type PlanPhoto = { id: string; position: number; isPrimary: boolean };

type Catalogue = readonly TemplateDefinition[];

function template(id: string, catalogue: Catalogue): TemplateDefinition {
  const found = newestTemplate(id, catalogue);
  if (!found) throw new Error(`Unknown template ${id}`);
  return found;
}

/** The graphic slots an organisation can choose a template for, and each slot's default. */
export const GRAPHIC_SLOTS: Record<BrandTemplateSlot, { label: string; assetType: AssetType; aspectRatio: AspectRatio; defaultTemplateId: string }> = {
  "social:square": { label: "Social post (square)", assetType: "social_post", aspectRatio: "1:1", defaultTemplateId: "social-square" },
  "social:portrait": { label: "Social post (portrait)", assetType: "social_post", aspectRatio: "4:5", defaultTemplateId: "social-portrait" },
  "story:primary": { label: "Story", assetType: "story", aspectRatio: "9:16", defaultTemplateId: "story" },
};

/** Templates an owner may choose for a slot: the newest version of each matching design, default first. */
export function selectableTemplates(slot: BrandTemplateSlot, catalogue: Catalogue = TEMPLATE_CATALOGUE): TemplateDefinition[] {
  const { assetType, aspectRatio, defaultTemplateId } = GRAPHIC_SLOTS[slot];
  const ids = [...new Set(catalogue.filter((t) => t.assetType === assetType && t.aspectRatio === aspectRatio).map((t) => t.id))];
  return ids
    .map((id) => newestTemplate(id, catalogue)!)
    .filter((t) => !t.retired)
    .sort((a, b) => Number(b.id === defaultTemplateId) - Number(a.id === defaultTemplateId));
}

/**
 * True when a slot's preferred template could not be honoured for an asset:
 * the template has been retired, or the asset was planned with a different
 * template because the preferred one no longer exists. Such an asset is
 * reported as unavailable; another template is never used in its place.
 */
export function preferenceUnavailable(
  asset: { slotKey: string; templateId: string },
  preferences: PreferredTemplates,
  catalogue: Catalogue = TEMPLATE_CATALOGUE,
): boolean {
  if (!(BRAND_TEMPLATE_SLOTS as readonly string[]).includes(asset.slotKey)) return false;
  const slot = asset.slotKey as BrandTemplateSlot;
  const preferred = preferences[slot];
  if (!preferred) return false;
  return !selectableTemplates(slot, catalogue).some((t) => t.id === preferred) || asset.templateId !== preferred;
}

/** The template a graphic slot is planned with, honouring the organisation's preference. */
function graphicTemplate(slot: BrandTemplateSlot, preferences: PreferredTemplates, catalogue: Catalogue): TemplateDefinition {
  const preferred = preferences[slot];
  // A preference whose template is gone from the catalogue has nothing to refer to;
  // the asset is planned on the default and reported unavailable by preferenceUnavailable.
  return (preferred ? newestTemplate(preferred, catalogue) : undefined) ?? template(GRAPHIC_SLOTS[slot].defaultTemplateId, catalogue);
}

export function planCampaignAssets(photos: readonly PlanPhoto[], preferences: PreferredTemplates = {}, catalogue: Catalogue = TEMPLATE_CATALOGUE): PlannedAsset[] {
  if (photos.length === 0) throw new Error("A campaign needs at least one photo");
  const ordered = [...photos].sort((a, b) => a.position - b.position);
  const primary = ordered.find((p) => p.isPrimary) ?? ordered[0]!;

  const graphic = (slot: BrandTemplateSlot) => ({ slotKey: slot as string, sourceMediaId: primary.id, t: graphicTemplate(slot, preferences, catalogue) });
  const slots: Array<{ slotKey: string; sourceMediaId: string | null; t: TemplateDefinition }> = [
    ...ordered.map((p) => ({ slotKey: `photo:${p.id}`, sourceMediaId: p.id, t: template("enhanced-photo", catalogue) })),
    graphic("social:square"),
    graphic("social:portrait"),
    graphic("story:primary"),
    { slotKey: "reel:slideshow", sourceMediaId: null, t: template("reel-slideshow", catalogue) },
    ...COPY_SLOTS.map((slot) => ({ slotKey: `copy:${slot}`, sourceMediaId: null, t: template(`copy-${slot.replace(/_/g, "-")}`, catalogue) })),
  ];

  return slots.map(({ t, ...slot }, sortOrder) => {
    // The slot's shape never changes, whatever template is recorded against it.
    const shape = (BRAND_TEMPLATE_SLOTS as readonly string[]).includes(slot.slotKey) ? GRAPHIC_SLOTS[slot.slotKey as BrandTemplateSlot] : t;
    return {
      ...slot,
      templateId: t.id,
      assetType: shape.assetType,
      aspectRatio: shape.aspectRatio,
      templateVersion: t.version,
      capability: t.capability,
      sortOrder,
      unavailable: preferenceUnavailable({ slotKey: slot.slotKey, templateId: t.id }, preferences, catalogue) ? ("template_unavailable" as const) : null,
    };
  });
}


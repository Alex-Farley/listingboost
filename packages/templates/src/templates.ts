import { ENHANCEMENT_OPERATIONS, type AspectRatio, type AssetType, type GenerationCapability } from "@listingboost/domain";

export type TemplateDefinition = {
  id: string;
  version: number;
  name: string;
  assetType: AssetType;
  aspectRatio: AspectRatio | null;
  capability: GenerationCapability;
  config: Record<string, unknown>;
  /** A retired design stays in the catalogue for the assets made with it, but can no longer be chosen. */
  retired?: boolean;
};

export const COPY_SLOTS = ["headline", "supporting_copy", "instagram_caption", "facebook_copy", "linkedin_copy", "hashtags", "cta"] as const;
export type CopySlot = (typeof COPY_SLOTS)[number];

const COPY_LIMITS: Record<CopySlot, { maxLength: number; description: string }> = {
  headline: { maxLength: 80, description: "A short headline for the listing" },
  supporting_copy: { maxLength: 400, description: "Two or three sentences of supporting marketing copy" },
  instagram_caption: { maxLength: 1200, description: "An Instagram caption" },
  facebook_copy: { maxLength: 1500, description: "A Facebook post" },
  linkedin_copy: { maxLength: 1500, description: "A professional LinkedIn post" },
  hashtags: { maxLength: 300, description: "Up to 12 relevant hashtags" },
  cta: { maxLength: 80, description: "A call to action inviting viewings" },
};

function graphic(id: string, name: string, assetType: "social_post" | "story", aspectRatio: AspectRatio, width: number, height: number): TemplateDefinition {
  return {
    id,
    version: 1,
    name,
    assetType,
    aspectRatio,
    capability: "template_render",
    config: {
      canvas: { width, height },
      imageSlot: { source: "primary_photo", fit: "cover" },
      textSlots: [
        { key: "headline", source: "copy:headline", maxLines: 2 },
        { key: "price", source: "fact:price", optional: true },
        { key: "summary", source: "fact:bedrooms_bathrooms", optional: true },
      ],
      logo: { position: "bottom-right", maxWidthRatio: 0.22 },
      cta: { source: "copy:cta" },
      colours: { from: "brand", fallback: { primary: "#1d2433", secondary: "#f6f1e8" } },
      typography: { from: "brand", fallback: { heading: "serif", body: "sans-serif" } },
    },
  };
}

export const DEFAULT_TEMPLATES: readonly TemplateDefinition[] = [
  {
    id: "enhanced-photo",
    version: 1,
    name: "Enhanced photograph",
    assetType: "enhanced_photo",
    aspectRatio: "original",
    capability: "image_enhancement",
    config: { operations: [...ENHANCEMENT_OPERATIONS] },
  },
  graphic("social-square", "Social post (square)", "social_post", "1:1", 1080, 1080),
  graphic("social-portrait", "Social post (portrait)", "social_post", "4:5", 1080, 1350),
  graphic("story", "Story", "story", "9:16", 1080, 1920),
  {
    id: "reel-slideshow",
    version: 1,
    name: "Reel (photo slideshow)",
    assetType: "reel",
    aspectRatio: "9:16",
    capability: "video_generation",
    config: { canvas: { width: 1080, height: 1920 }, secondsPerPhoto: 3, maxPhotos: 10, transition: "crossfade", mode: "slideshow" },
  },
  ...COPY_SLOTS.map(
    (slot): TemplateDefinition => ({
      id: `copy-${slot.replace(/_/g, "-")}`,
      version: 1,
      name: `Copy: ${slot.replace(/_/g, " ")}`,
      assetType: "copy",
      aspectRatio: null,
      capability: "text_generation",
      config: { slot, ...COPY_LIMITS[slot] },
    }),
  ),
];

type GraphicSpec = { id: string; name: string; assetType: "social_post" | "story"; aspectRatio: AspectRatio; width: number; height: number };

const GRAPHIC_SPECS: readonly GraphicSpec[] = [
  { id: "social-square", name: "Social post (square)", assetType: "social_post", aspectRatio: "1:1", width: 1080, height: 1080 },
  { id: "social-portrait", name: "Social post (portrait)", assetType: "social_post", aspectRatio: "4:5", width: 1080, height: 1350 },
  { id: "story", name: "Story", assetType: "story", aspectRatio: "9:16", width: 1080, height: 1920 },
];

const brandTextSlots = [
  { key: "headline", source: "copy:headline", maxLines: 2 },
  { key: "price", source: "fact:price", optional: true },
  { key: "summary", source: "fact:bedrooms_bathrooms", optional: true },
];

/**
 * Version 2 of the original layout: the photo above a panel in the brand
 * colour. It now draws the logo and uses the brand's fonts, and declares which
 * agency and contact fields it shows.
 */
function brandPanel(spec: GraphicSpec): TemplateDefinition {
  return {
    id: spec.id,
    version: 2,
    name: `${spec.name}: brand panel`,
    assetType: spec.assetType,
    aspectRatio: spec.aspectRatio,
    capability: "template_render",
    config: {
      layout: "split",
      layoutLabel: "Brand panel",
      canvas: { width: spec.width, height: spec.height },
      imageSlot: { source: "primary_photo", fit: "cover" },
      textSlots: brandTextSlots,
      logo: { position: "bottom-right", maxWidthRatio: 0.22, maxHeightRatio: 0.09 },
      cta: { source: "copy:cta" },
      // Shown only when set; the agency name is replaced by the logo when there is one.
      brandFields: ["agencyName"],
      colours: { from: "brand", fallback: { primary: "#1d2433", secondary: "#f6f1e8" } },
      typography: { from: "brand", fallback: { heading: "serif", body: "sans-serif" } },
    },
  };
}

/**
 * "Full photo" (work/001-brand-settings spec): the photo fills the canvas and
 * text sits over a dark gradient across the bottom third. The gradient is a
 * design overlay, like the crop; the photograph itself is not edited.
 */
function fullPhoto(spec: GraphicSpec): TemplateDefinition {
  return {
    id: `${spec.id}-full`,
    version: 1,
    name: `${spec.name}: full photo`,
    assetType: spec.assetType,
    aspectRatio: spec.aspectRatio,
    capability: "template_render",
    config: {
      layout: "full-photo",
      layoutLabel: "Full photo",
      canvas: { width: spec.width, height: spec.height },
      imageSlot: { source: "primary_photo", fit: "cover" },
      textSlots: brandTextSlots,
      logo: { position: "top-left", maxWidthRatio: 0.26, maxHeightRatio: 0.09, badge: true },
      cta: { source: "copy:cta" },
      brandFields: ["agencyName"],
      overlay: { kind: "gradient", coverage: 1 / 3 },
      // Instagram draws its own controls over the top and bottom of a Story.
      ...(spec.assetType === "story" ? { safeArea: { top: 250, bottom: 250 } } : {}),
      colours: { from: "brand", fallback: { primary: "#1d2433", secondary: "#f6f1e8" } },
      typography: { from: "brand", fallback: { heading: "serif", body: "sans-serif" } },
    },
  };
}

/** Templates added by work item 001, seeded by migrations/0004_brand_templates.sql. */
export const BRAND_TEMPLATES: readonly TemplateDefinition[] = [...GRAPHIC_SPECS.map(brandPanel), ...GRAPHIC_SPECS.map(fullPhoto)];

/**
 * Every template version there has ever been. Versions are never edited or
 * removed: an asset keeps the version it was made with (Master Spec §21).
 */
export const TEMPLATE_CATALOGUE: readonly TemplateDefinition[] = [...DEFAULT_TEMPLATES, ...BRAND_TEMPLATES];

export function findTemplate(id: string, version: number, catalogue: readonly TemplateDefinition[] = TEMPLATE_CATALOGUE): TemplateDefinition | undefined {
  return catalogue.find((t) => t.id === id && t.version === version);
}

/** The newest version of a template id, or undefined when the id is not in the catalogue. */
export function newestTemplate(id: string, catalogue: readonly TemplateDefinition[] = TEMPLATE_CATALOGUE): TemplateDefinition | undefined {
  return catalogue.filter((t) => t.id === id).sort((a, b) => b.version - a.version)[0];
}

/** Slideshow Reels are rendered in the agent's browser from their own photos (D-019). */
export function isBrowserSlideshow(template: Pick<TemplateDefinition, "assetType" | "config"> | undefined): boolean {
  return template?.assetType === "reel" && template.config.mode === "slideshow";
}

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

function seedSql(templates: readonly TemplateDefinition[], createdAt: string): string {
  const rows = templates.map(
    (t) =>
      `  (${sqlString(t.id)}, ${t.version}, ${sqlString(t.name)}, ${sqlString(t.assetType)}, ${t.aspectRatio ? sqlString(t.aspectRatio) : "NULL"}, ${sqlString(
        JSON.stringify({ capability: t.capability, ...t.config }),
      )}, '${createdAt}')`,
  );
  return [
    "-- Generated by templateSeedSql() in packages/templates. Do not edit by hand;",
    "-- template changes ship as a new version in a new migration.",
    "INSERT INTO templates (id, version, name, asset_type, aspect_ratio, config_json, created_at) VALUES",
    rows.join(",\n") + ";",
    "",
  ].join("\n");
}

/** Source of migrations/0002_default_templates.sql; a unit test keeps them identical. */
export function templateSeedSql(): string {
  return seedSql(DEFAULT_TEMPLATES, "2026-09-25T00:00:00.000Z");
}

/** Source of migrations/0004_brand_templates.sql; a unit test keeps them identical. */
export function brandTemplateSeedSql(): string {
  return seedSql(BRAND_TEMPLATES, "2026-10-02T00:00:00.000Z");
}

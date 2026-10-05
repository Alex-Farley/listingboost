import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  brandTemplateSeedSql,
  COPY_SLOTS,
  DEFAULT_TEMPLATES,
  findTemplate,
  GRAPHIC_SLOTS,
  planCampaignAssets,
  selectableTemplates,
  TEMPLATE_CATALOGUE,
  templateSeedSql,
} from "@listingboost/templates";

const photos = [
  { id: "m2", position: 1, isPrimary: false },
  { id: "m1", position: 0, isPrimary: false },
  { id: "m3", position: 2, isPrimary: true },
];

describe("data-driven, versioned templates", () => {
  test("every template has id, positive version, asset type, capability and config", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/);
      expect(t.version).toBeGreaterThan(0);
      expect(t.capability).toBeString();
      expect(t.config).toBeObject();
    }
    expect(new Set(DEFAULT_TEMPLATES.map((t) => `${t.id}@${t.version}`)).size).toBe(DEFAULT_TEMPLATES.length);
  });

  test("graphic templates define canvas, image slot, text slots, logo position, CTA and brand styling", () => {
    const graphics = DEFAULT_TEMPLATES.filter((t) => t.assetType === "social_post" || t.assetType === "story");
    expect(graphics.map((t) => t.aspectRatio).sort()).toEqual(["1:1", "4:5", "9:16"]);
    for (const t of graphics) {
      const c = t.config as Record<string, unknown>;
      for (const key of ["canvas", "imageSlot", "textSlots", "logo", "cta", "colours", "typography"]) expect(c).toHaveProperty(key);
    }
  });

  test("the database seed migration matches the template definitions exactly", () => {
    const sql = readFileSync(join(import.meta.dir, "../../migrations/0002_default_templates.sql"), "utf8");
    expect(sql).toBe(templateSeedSql());
  });
});

describe("AT-06 campaign asset plan", () => {
  const plan = planCampaignAssets(photos);

  test("one enhanced photo per source photo, in photo order", () => {
    const enhanced = plan.filter((a) => a.assetType === "enhanced_photo");
    expect(enhanced.map((a) => [a.slotKey, a.sourceMediaId, a.aspectRatio])).toEqual([
      ["photo:m1", "m1", "original"],
      ["photo:m2", "m2", "original"],
      ["photo:m3", "m3", "original"],
    ]);
  });

  test("social 1:1 and 4:5, story 9:16 from the primary photo; one 9:16 reel", () => {
    const pick = (slot: string) => plan.find((a) => a.slotKey === slot)!;
    expect(pick("social:square")).toMatchObject({ assetType: "social_post", aspectRatio: "1:1", sourceMediaId: "m3" });
    expect(pick("social:portrait")).toMatchObject({ assetType: "social_post", aspectRatio: "4:5", sourceMediaId: "m3" });
    expect(pick("story:primary")).toMatchObject({ assetType: "story", aspectRatio: "9:16", sourceMediaId: "m3" });
    expect(pick("reel:slideshow")).toMatchObject({ assetType: "reel", aspectRatio: "9:16", sourceMediaId: null });
  });

  test("the full copy set", () => {
    expect(plan.filter((a) => a.assetType === "copy").map((a) => a.slotKey)).toEqual(COPY_SLOTS.map((s) => `copy:${s}`));
    expect([...COPY_SLOTS].sort()).toEqual(["cta", "facebook_copy", "hashtags", "headline", "instagram_caption", "linkedin_copy", "supporting_copy"]);
  });

  test("falls back to the first photo when none is primary; unique slots; sequential order", () => {
    const p = planCampaignAssets(photos.map((x) => ({ ...x, isPrimary: false })));
    expect(p.find((a) => a.slotKey === "social:square")?.sourceMediaId).toBe("m1");
    expect(new Set(p.map((a) => a.slotKey)).size).toBe(p.length);
    expect(p.map((a) => a.sortOrder)).toEqual(p.map((_, i) => i));
    // Planned assets use the newest template versions, which live in the full catalogue (work item 001).
    for (const a of p) expect(TEMPLATE_CATALOGUE.some((t) => t.id === a.templateId && t.version === a.templateVersion)).toBe(true);
  });

  test("refuses to plan without photos", () => {
    expect(() => planCampaignAssets([])).toThrow();
  });
});

describe("AT-22 brand templates and preferences", () => {
  const graphicSlots = ["social:square", "social:portrait", "story:primary"] as const;
  const pick = (plan: ReturnType<typeof planCampaignAssets>, slot: string) => plan.find((a) => a.slotKey === slot)!;

  test("the catalogue keeps every version: the originals are unchanged and new versions are added", () => {
    for (const t of DEFAULT_TEMPLATES) expect(TEMPLATE_CATALOGUE).toContain(t);
    expect(new Set(TEMPLATE_CATALOGUE.map((t) => `${t.id}@${t.version}`)).size).toBe(TEMPLATE_CATALOGUE.length);
    for (const id of ["social-square", "social-portrait", "story"]) {
      expect(findTemplate(id, 1)).toBeDefined();
      expect(findTemplate(id, 2)).toBeDefined();
      expect(findTemplate(id, 1)!.config).not.toHaveProperty("layout");
    }
  });

  test("migration 0004 matches the added template definitions exactly", () => {
    const sql = readFileSync(join(import.meta.dir, "../../migrations/0004_brand_templates.sql"), "utf8");
    expect(sql).toBe(brandTemplateSeedSql());
    expect(sql).not.toContain("'enhanced-photo'");
  });

  test("each graphic slot offers two layouts, both at the slot's size (AC26a)", () => {
    for (const slot of graphicSlots) {
      const options = selectableTemplates(slot);
      expect(options.map((t) => t.config.layout)).toEqual(["split", "full-photo"]);
      expect(options.map((t) => t.config.layoutLabel)).toEqual(["Brand panel", "Full photo"]);
      for (const t of options) {
        expect(t.assetType).toBe(GRAPHIC_SLOTS[slot].assetType);
        expect(t.aspectRatio).toBe(GRAPHIC_SLOTS[slot].aspectRatio);
        expect(t.capability).toBe("template_render");
      }
      expect(options[0]!.id).toBe(GRAPHIC_SLOTS[slot].defaultTemplateId);
    }
    expect(selectableTemplates("story:primary").map((t) => t.id)).toEqual(["story", "story-full"]);
  });

  test("new graphic templates declare logo position, fonts from the brand and the brand fields they show", () => {
    for (const slot of graphicSlots) {
      for (const t of selectableTemplates(slot)) {
        const c = t.config as Record<string, unknown>;
        for (const key of ["canvas", "imageSlot", "textSlots", "logo", "cta", "colours", "typography", "brandFields", "layout"]) expect(c).toHaveProperty(key);
        expect(Array.isArray(c.brandFields)).toBe(true);
      }
    }
    expect((findTemplate("story-full", 1)!.config as { safeArea: unknown }).safeArea).toEqual({ top: 250, bottom: 250 });
    expect((findTemplate("social-square-full", 1)!.config as { logo: { position: string } }).logo.position).toBe("top-left");
  });

  test("with no preference a slot uses the newest version of its default template (AC27)", () => {
    const plan = planCampaignAssets(photos);
    expect(pick(plan, "social:square")).toMatchObject({ templateId: "social-square", templateVersion: 2, unavailable: null });
    expect(pick(plan, "social:portrait")).toMatchObject({ templateId: "social-portrait", templateVersion: 2 });
    expect(pick(plan, "story:primary")).toMatchObject({ templateId: "story", templateVersion: 2 });
    expect(planCampaignAssets(photos, {})).toEqual(plan);
  });

  test("a preference records that template's id and newest version; other slots keep their default (AC26)", () => {
    const plan = planCampaignAssets(photos, { "social:square": "social-square-full", "story:primary": "story-full" });
    expect(pick(plan, "social:square")).toMatchObject({ templateId: "social-square-full", templateVersion: 1, assetType: "social_post", aspectRatio: "1:1", unavailable: null });
    expect(pick(plan, "story:primary")).toMatchObject({ templateId: "story-full", templateVersion: 1 });
    expect(pick(plan, "social:portrait")).toMatchObject({ templateId: "social-portrait", templateVersion: 2 });
  });

  test("every planned asset refers to a template in the catalogue", () => {
    for (const a of planCampaignAssets(photos, { "social:portrait": "social-portrait-full" })) {
      expect(TEMPLATE_CATALOGUE.some((t) => t.id === a.templateId && t.version === a.templateVersion)).toBe(true);
    }
  });
});

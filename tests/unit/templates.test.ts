import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COPY_SLOTS, DEFAULT_TEMPLATES, planCampaignAssets, templateSeedSql } from "@listingboost/templates";

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
    for (const a of p) expect(DEFAULT_TEMPLATES.some((t) => t.id === a.templateId && t.version === a.templateVersion)).toBe(true);
  });

  test("refuses to plan without photos", () => {
    expect(() => planCampaignAssets([])).toThrow();
  });
});

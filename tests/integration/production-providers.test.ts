import { describe, expect, test } from "bun:test";
import { createProductionProviders } from "../../apps/web/server/providers";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto } from "../support/app";
import { renderAssetsFromDisk } from "../support/render-assets";

const PRODUCTION_PROVIDERS = createProductionProviders(renderAssetsFromDisk());

describe("R7a/R7b production providers", () => {
  test("only capabilities with a real adapter are registered", () => {
    expect(Object.keys(PRODUCTION_PROVIDERS).sort()).toEqual(["template_render", "text_generation"]);
  });

  test("copy is generated end to end from recorded facts, including brand names that contain claim words", async () => {
    const app = createTestApp({ providers: PRODUCTION_PROVIDERS });
    const account = await signUp(app, { agencyName: "Garden City Estates" });
    const propertyId = await createProperty(app, account.cookie, {
      title: "12 Orchard Way",
      town: "Harpenden",
      bedrooms: 3,
      price: { amount: 650000, qualifier: "guide_price" },
    });
    await uploadPhoto(app, account.cookie, propertyId);
    const campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: account.cookie, body: "{}" })).json()) as { id: string }).id;
    const generated = (await (await app.request(`/api/campaigns/${campaignId}/generate`, { method: "POST", cookie: account.cookie })).json()) as {
      queued: number;
      unavailable: string[];
    };
    expect(generated.queued).toBe(10);
    expect(generated.unavailable.some((s) => s.startsWith("photo:"))).toBe(true);
    await drainQueue(app);

    const rows = app.db.raw
      .query("SELECT v.state, v.provider, v.text_content FROM asset_versions v JOIN campaign_assets a ON a.id = v.asset_id WHERE a.asset_type = 'copy'")
      .all() as Array<{ state: string; provider: string; text_content: string }>;
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row).toMatchObject({ state: "needs_review", provider: "listingboost-facts" });
    }
    const all = rows.map((r) => r.text_content).join("\n");
    expect(all).toContain("3 bedroom detached house in Harpenden");
    expect(all).toContain("Guide price £650,000");
    expect(all).toContain("Garden City Estates");
  });

  test("social posts and Stories render end to end as PNGs at their template sizes", async () => {
    const app = createTestApp({ providers: PRODUCTION_PROVIDERS });
    const account = await signUp(app, { agencyName: "Orchard Homes" });
    const propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way", town: "Harpenden", bedrooms: 3 });
    await uploadPhoto(app, account.cookie, propertyId);
    const campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: account.cookie, body: "{}" })).json()) as { id: string }).id;
    await app.request(`/api/campaigns/${campaignId}/generate`, { method: "POST", cookie: account.cookie });
    await drainQueue(app);

    const rows = app.db.raw
      .query(
        "SELECT a.slot_key AS slot, v.state, v.provider, v.output_content_type, v.output_width, v.output_height, v.output_object_key FROM asset_versions v JOIN campaign_assets a ON a.id = v.asset_id WHERE a.asset_type IN ('social_post','story') ORDER BY a.slot_key",
      )
      .all() as Array<{ slot: string; state: string; provider: string; output_content_type: string; output_width: number; output_height: number; output_object_key: string }>;
    expect(rows.map((r) => [r.slot, r.output_width, r.output_height])).toEqual([
      ["social:portrait", 1080, 1350],
      ["social:square", 1080, 1080],
      ["story:primary", 1080, 1920],
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({ state: "needs_review", provider: "listingboost-render", output_content_type: "image/png" });
      const bytes = await app.store.get(row.output_object_key);
      expect(bytes).not.toBeNull();
    }
  });
});

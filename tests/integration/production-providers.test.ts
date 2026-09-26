import { describe, expect, test } from "bun:test";
import { PRODUCTION_PROVIDERS } from "../../apps/web/server/providers";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto } from "../support/app";

describe("R7a production providers", () => {
  test("only capabilities with a real adapter are registered", () => {
    expect(Object.keys(PRODUCTION_PROVIDERS).sort()).toEqual(["text_generation"]);
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
    expect(generated.queued).toBe(7);
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
});

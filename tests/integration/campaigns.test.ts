import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders } from "../support/providers";

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;

type CampaignView = {
  id: string;
  propertyId: string;
  name: string;
  status: string;
  assets: Array<{ id: string; slotKey: string; assetType: string; aspectRatio: string | null; sourceMediaId: string | null; versions: unknown[] }>;
  progress: Array<{ key: string; label: string; status: string }>;
};

beforeEach(async () => {
  app = createTestApp({ providers: fakeProviders().registry });
  account = await signUp(app);
  propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way" });
});

const createCampaign = (body: unknown = {}) =>
  app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: account.cookie, body: JSON.stringify(body) });

describe("AT-06 campaign creation", () => {
  test("requires at least one photo", async () => {
    const response = await createCampaign();
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("photos_required");
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number }).n).toBe(0);
  });

  test("creates a draft campaign with the planned asset slots", async () => {
    const m1 = await uploadPhoto(app, account.cookie, propertyId);
    const m2 = await uploadPhoto(app, account.cookie, propertyId, "photo-800x600.png", "image/png");
    const response = await createCampaign({ name: "Spring launch" });
    expect(response.status).toBe(201);
    const campaign = (await response.json()) as CampaignView;
    expect(campaign).toMatchObject({ propertyId, name: "Spring launch", status: "draft" });
    expect(campaign.assets.map((a) => a.slotKey)).toEqual([
      `photo:${m1}`,
      `photo:${m2}`,
      "social:square",
      "social:portrait",
      "story:primary",
      "reel:slideshow",
      "copy:headline",
      "copy:supporting_copy",
      "copy:instagram_caption",
      "copy:facebook_copy",
      "copy:linkedin_copy",
      "copy:hashtags",
      "copy:cta",
    ]);
    expect(campaign.assets.every((a) => a.versions.length === 0)).toBe(true);
    expect(campaign.progress.map((g) => [g.key, g.status])).toEqual([
      ["property", "complete"],
      ["photography", "not_started"],
      ["social", "not_started"],
      ["stories", "not_started"],
      ["reel", "not_started"],
      ["copy", "not_started"],
      ["pack", "not_started"],
    ]);
  });

  test("default name comes from the property; campaigns are listed per property newest first", async () => {
    await uploadPhoto(app, account.cookie, propertyId);
    const first = (await (await createCampaign()).json()) as CampaignView;
    const second = (await (await createCampaign({ name: "Relaunch" })).json()) as CampaignView;
    expect(first.name).toBe("12 Orchard Way");
    const list = (await (await app.request(`/api/properties/${propertyId}/campaigns`, { cookie: account.cookie })).json()) as { items: CampaignView[] };
    expect(list.items.map((c) => c.id)).toEqual([second.id, first.id]);
  });

  test("a photo used by a campaign can no longer be deleted", async () => {
    const m1 = await uploadPhoto(app, account.cookie, propertyId);
    await createCampaign();
    const response = await app.request(`/api/properties/${propertyId}/media/${m1}`, { method: "DELETE", cookie: account.cookie });
    expect(response.status).toBe(409);
  });
});

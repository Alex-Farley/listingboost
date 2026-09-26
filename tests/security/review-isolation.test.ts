import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders } from "../support/providers";

let app: TestApp;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
let campaignId: string;
let assetId: string;
let versionId: string;

beforeEach(async () => {
  app = createTestApp({ providers: fakeProviders().registry });
  alice = await signUp(app);
  bob = await signUp(app);
  const propertyId = await createProperty(app, alice.cookie);
  await uploadPhoto(app, alice.cookie, propertyId);
  campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: alice.cookie, body: "{}" })).json()) as { id: string }).id;
  await app.request(`/api/campaigns/${campaignId}/generate`, { method: "POST", cookie: alice.cookie });
  await drainQueue(app);
  const view = (await (await app.request(`/api/campaigns/${campaignId}`, { cookie: alice.cookie })).json()) as {
    assets: Array<{ id: string; slotKey: string; versions: Array<{ id: string }> }>;
  };
  const headline = view.assets.find((a) => a.slotKey === "copy:headline")!;
  assetId = headline.id;
  versionId = headline.versions[0]!.id;
});

describe("AT-02 review actions are tenant-isolated", () => {
  test("another organisation cannot approve, reject, edit or discard", async () => {
    const base = `/api/campaigns/${campaignId}/assets/${assetId}`;
    const responses = await Promise.all([
      app.request(`${base}/versions/${versionId}/approve`, { method: "POST", cookie: bob.cookie }),
      app.request(`${base}/versions/${versionId}/reject`, { method: "POST", cookie: bob.cookie }),
      app.request(`${base}/text`, { method: "PUT", cookie: bob.cookie, body: JSON.stringify({ text: "Hijacked" }) }),
      app.request(`${base}/discard`, { method: "POST", cookie: bob.cookie }),
    ]);
    for (const response of responses) expect(response.status).toBe(404);
    expect(app.db.raw.query("SELECT state FROM asset_versions WHERE id = ?").get(versionId)).toEqual({ state: "needs_review" });
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM asset_versions WHERE asset_id = ?").get(assetId) as { n: number }).n).toBe(1);
    expect(app.db.raw.query("SELECT discarded_at FROM campaign_assets WHERE id = ?").get(assetId)).toEqual({ discarded_at: null });
  });

  test("review actions require the CSRF header", async () => {
    const response = await app.request(`/api/campaigns/${campaignId}/assets/${assetId}/versions/${versionId}/approve`, {
      method: "POST",
      cookie: alice.cookie,
      csrf: false,
    });
    expect(response.status).toBe(403);
  });
});

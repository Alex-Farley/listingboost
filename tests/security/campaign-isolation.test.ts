import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders } from "../support/providers";

let app: TestApp;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;
let campaignId: string;
let assetId: string;
let outputUrl: string;

beforeEach(async () => {
  app = createTestApp({ providers: fakeProviders().registry });
  alice = await signUp(app);
  bob = await signUp(app);
  propertyId = await createProperty(app, alice.cookie);
  await uploadPhoto(app, alice.cookie, propertyId);
  campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: alice.cookie, body: "{}" })).json()) as { id: string }).id;
  await app.request(`/api/campaigns/${campaignId}/generate`, { method: "POST", cookie: alice.cookie });
  await drainQueue(app);
  const view = (await (await app.request(`/api/campaigns/${campaignId}`, { cookie: alice.cookie })).json()) as {
    assets: Array<{ id: string; assetType: string; versions: Array<{ media: { url: string } | null }> }>;
  };
  const photo = view.assets.find((a) => a.assetType === "enhanced_photo")!;
  assetId = photo.id;
  outputUrl = photo.versions[0]!.media!.url;
});

describe("AT-02 campaign isolation", () => {
  test("another organisation cannot create, read, list, generate or regenerate", async () => {
    const attempts = await Promise.all([
      app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: bob.cookie, body: "{}" }),
      app.request(`/api/properties/${propertyId}/campaigns`, { cookie: bob.cookie }),
      app.request(`/api/campaigns/${campaignId}`, { cookie: bob.cookie }),
      app.request(`/api/campaigns/${campaignId}/generate`, { method: "POST", cookie: bob.cookie }),
      app.request(`/api/campaigns/${campaignId}/assets/${assetId}/regenerate`, { method: "POST", cookie: bob.cookie }),
    ]);
    for (const response of attempts) expect(response.status).toBe(404);
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM campaigns").get() as { n: number }).n).toBe(1);
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM asset_versions WHERE asset_id = ?").get(assetId) as { n: number }).n).toBe(1);
  });

  test("unauthenticated requests are rejected", async () => {
    expect((await app.request(`/api/campaigns/${campaignId}`)).status).toBe(401);
  });

  test("asset id from another campaign cannot be regenerated through this campaign", async () => {
    const other = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: alice.cookie, body: "{}" })).json()) as { id: string }).id;
    expect((await app.request(`/api/campaigns/${other}/assets/${assetId}/regenerate`, { method: "POST", cookie: alice.cookie })).status).toBe(404);
  });
});

describe("AT-12/AT-19 generated output downloads", () => {
  test("output URLs are signed and tamper-proof", async () => {
    expect((await app.request(outputUrl)).status).toBe(200);
    expect((await app.request(outputUrl.replace(/sig=./, "sig=Z"))).status).toBe(403);
    expect((await app.request(outputUrl.replace("/output/", "/source/"))).status).toBe(403);
  });
});

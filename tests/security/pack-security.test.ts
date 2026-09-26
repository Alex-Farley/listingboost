import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders } from "../support/providers";

let app: TestApp;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
let campaignId: string;
let photo: { id: string; versionId: string };

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
    assets: Array<{ id: string; assetType: string; versions: Array<{ id: string }> }>;
  };
  const p = view.assets.find((a) => a.assetType === "enhanced_photo")!;
  photo = { id: p.id, versionId: p.versions[0]!.id };
  await app.request(`/api/campaigns/${campaignId}/assets/${p.id}/versions/${photo.versionId}/approve`, { method: "POST", cookie: alice.cookie });
});

describe("AT-12/AT-14 pack and download permissions are enforced server-side", () => {
  test("unauthenticated users cannot download the pack", async () => {
    expect((await app.request(`/api/campaigns/${campaignId}/pack`)).status).toBe(401);
  });

  test("another organisation cannot download the pack or obtain a download link", async () => {
    const packResponse = await app.request(`/api/campaigns/${campaignId}/pack`, { cookie: bob.cookie });
    expect(packResponse.status).toBe(404);
    const link = await app.request(`/api/campaigns/${campaignId}/assets/${photo.id}/versions/${photo.versionId}/download`, { cookie: bob.cookie });
    expect(link.status).toBe(404);
    expect(await link.text()).not.toContain("sig=");
  });
});

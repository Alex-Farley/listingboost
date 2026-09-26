import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, signUp, uploadPhoto, type TestApp } from "../support/app";
import { videoFixture } from "../support/fixtures";

let app: TestApp;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
let url: string;
let photoIds: string[];

function reelForm(ids: string[]): FormData {
  const form = new FormData();
  form.append("video", new File([videoFixture("reel-1080x1920-2photos.mp4")], "reel.mp4", { type: "video/mp4" }));
  form.append("photoIds", JSON.stringify(ids));
  return form;
}

const versionCount = () => (app.db.raw.query("SELECT COUNT(*) AS n FROM asset_versions").get() as { n: number }).n;

beforeEach(async () => {
  app = createTestApp();
  alice = await signUp(app);
  bob = await signUp(app);
  const propertyId = await createProperty(app, alice.cookie);
  photoIds = [await uploadPhoto(app, alice.cookie, propertyId), await uploadPhoto(app, alice.cookie, propertyId)];
  const campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: alice.cookie, body: "{}" })).json()) as { id: string }).id;
  const view = (await (await app.request(`/api/campaigns/${campaignId}`, { cookie: alice.cookie })).json()) as { assets: Array<{ id: string; assetType: string }> };
  url = `/api/campaigns/${campaignId}/assets/${view.assets.find((a) => a.assetType === "reel")!.id}/slideshow`;
});

describe("AT-02 / AT-19 slideshow Reel isolation", () => {
  test("another organisation gets 404 for the plan and the upload, and nothing is written", async () => {
    expect((await app.request(url, { cookie: bob.cookie })).status).toBe(404);
    expect((await app.request(url, { method: "POST", cookie: bob.cookie, body: reelForm(photoIds) })).status).toBe(404);
    expect(versionCount()).toBe(0);
  });

  test("another organisation cannot reference its own photos in Alice's Reel", async () => {
    const bobProperty = await createProperty(app, bob.cookie);
    const bobPhotos = [await uploadPhoto(app, bob.cookie, bobProperty), await uploadPhoto(app, bob.cookie, bobProperty)];
    const response = await app.request(url, { method: "POST", cookie: alice.cookie, body: reelForm(bobPhotos) });
    expect(response.status).toBe(400);
    expect(versionCount()).toBe(0);
  });

  test("signed out: 401; no signed photo links are issued", async () => {
    const response = await app.request(url);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("sig=");
    expect((await app.request(url, { method: "POST", body: reelForm(photoIds) })).status).toBe(401);
  });

  test("the upload requires the CSRF header", async () => {
    expect((await app.request(url, { method: "POST", cookie: alice.cookie, csrf: false, body: reelForm(photoIds) })).status).toBe(403);
    expect(versionCount()).toBe(0);
  });

  test("oversized uploads are refused before the body is read", async () => {
    const response = await app.request(url, {
      method: "POST",
      cookie: alice.cookie,
      headers: { "Content-Length": String(200 * 1024 * 1024) },
      body: reelForm(photoIds),
    });
    expect(response.status).toBe(413);
    expect(versionCount()).toBe(0);
  });
});

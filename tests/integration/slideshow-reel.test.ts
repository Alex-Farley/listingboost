import { beforeEach, describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import { createProperty, createTestApp, signUp, uploadPhoto, type TestApp } from "../support/app";
import { videoFixture } from "../support/fixtures";

type VersionView = { id: string; versionNumber: number; state: string; media: { url: string; contentType: string; width: number; height: number } | null };
type AssetView = { id: string; slotKey: string; assetType: string; available: boolean; renderer: string | null; versions: VersionView[] };
type CampaignView = { assets: AssetView[]; progress: Array<{ key: string; status: string }> };
type Plan = {
  spec: { width: number; height: number; fps: number; secondsPerPhoto: number; crossfadeSeconds: number };
  photos: Array<{ id: string; url: string; width: number; height: number }>;
};

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;
let photoIds: string[];
let campaignId: string;

const view = async () => (await (await app.request(`/api/campaigns/${campaignId}`, { cookie: account.cookie })).json()) as CampaignView;
const reel = async () => (await view()).assets.find((a) => a.assetType === "reel")!;
const planUrl = (assetId: string) => `/api/campaigns/${campaignId}/assets/${assetId}/slideshow`;

function reelForm(ids: string[], file = "reel-1080x1920-2photos.mp4"): FormData {
  const form = new FormData();
  form.append("video", new File([videoFixture(file)], "reel.mp4", { type: "video/mp4" }));
  form.append("photoIds", JSON.stringify(ids));
  return form;
}

const upload = async (ids = photoIds, file?: string) =>
  app.request(planUrl((await reel()).id), { method: "POST", cookie: account.cookie, body: reelForm(ids, file) });

const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;
const outputObjects = () => [...app.store.objects.keys()].filter((k) => k.includes("/output/"));
const versionCount = () => (app.db.raw.query("SELECT COUNT(*) AS n FROM asset_versions").get() as { n: number }).n;

beforeEach(async () => {
  // No server-side video provider is registered: the Reel is made in the browser.
  app = createTestApp();
  account = await signUp(app);
  propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way, Harpenden" });
  photoIds = [await uploadPhoto(app, account.cookie, propertyId), await uploadPhoto(app, account.cookie, propertyId, "photo-1080x1350.jpg")];
  campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: account.cookie, body: "{}" })).json()) as { id: string }).id;
});

describe("R7c slideshow Reel is made in the browser", () => {
  test("the Reel is offered as browser-rendered (not server-generated) and not reported unavailable", async () => {
    const campaign = await view();
    const asset = campaign.assets.find((a) => a.assetType === "reel")!;
    expect(asset).toMatchObject({ available: false, renderer: "browser" });
    expect(campaign.assets.find((a) => a.assetType === "social_post")).toMatchObject({ available: false, renderer: null });
    expect(campaign.progress.find((p) => p.key === "reel")!.status).toBe("not_started");
  });

  test("the plan lists the listing's photos in order with signed links to the originals", async () => {
    const response = await app.request(planUrl((await reel()).id), { cookie: account.cookie });
    expect(response.status).toBe(200);
    const plan = (await response.json()) as Plan;
    expect(plan.spec).toEqual({ width: 1080, height: 1920, fps: 30, secondsPerPhoto: 3, crossfadeSeconds: 0.5 });
    expect(plan.photos.map((p) => [p.id, p.width, p.height])).toEqual([
      [photoIds[0]!, 800, 600],
      [photoIds[1]!, 1080, 1350],
    ]);
    const original = await app.request(plan.photos[1]!.url);
    expect(original.status).toBe(200);
    expect(original.headers.get("Content-Type")).toBe("image/jpeg");
  });

  test("an uploaded Reel becomes a new version awaiting review, with full provenance", async () => {
    const response = await upload();
    expect(response.status).toBe(201);
    const { version } = (await response.json()) as { version: VersionView };
    expect(version).toMatchObject({ versionNumber: 1, state: "needs_review", media: { contentType: "video/mp4", width: 1080, height: 1920 } });

    const row = app.db.raw
      .query(
        "SELECT origin, provider, model, prompt_version, template_version, parameters_json, reference_media_ids_json, output_object_key, output_byte_size FROM asset_versions WHERE id = ?",
      )
      .get(version.id) as Record<string, string | number>;
    expect(row).toMatchObject({ origin: "generation", provider: "listingboost-slideshow", model: "browser-vp09", prompt_version: "slideshow-v1", template_version: 1 });
    expect(JSON.parse(row.reference_media_ids_json as string)).toEqual(photoIds);
    expect(JSON.parse(row.parameters_json as string)).toEqual({
      renderer: "browser",
      codec: "vp09",
      fps: 30,
      secondsPerPhoto: 3,
      crossfadeSeconds: 0.5,
      durationSeconds: 6,
    });
    const stored = await app.store.get(row.output_object_key as string);
    expect(new Uint8Array(await new Response(stored!.body).arrayBuffer())).toEqual(videoFixture("reel-1080x1920-2photos.mp4"));

    const audit = app.db.raw.query("SELECT action FROM audit_events WHERE subject_id = ?").all(version.id) as Array<{ action: string }>;
    expect(audit.map((a) => a.action)).toEqual(["asset_version.created"]);
    expect((await view()).progress.find((p) => p.key === "reel")!.status).toBe("needs_review");

    const video = await app.request(version.media!.url);
    expect(video.status).toBe(200);
    expect(video.headers.get("Content-Type")).toBe("video/mp4");
  });

  test("approved, the Reel is in the marketing pack byte for byte", async () => {
    const { version } = (await (await upload()).json()) as { version: VersionView };
    const asset = await reel();
    expect((await app.request(`/api/campaigns/${campaignId}/assets/${asset.id}/versions/${version.id}/approve`, { method: "POST", cookie: account.cookie })).status).toBe(200);
    const files = unzipSync(new Uint8Array(await (await app.request(`/api/campaigns/${campaignId}/pack`, { cookie: account.cookie })).arrayBuffer()));
    expect(files["12-orchard-way-harpenden/Reels/12-orchard-way-harpenden-reel.mp4"]).toEqual(videoFixture("reel-1080x1920-2photos.mp4"));
  });

  test("making it again adds version 2 and leaves version 1 untouched", async () => {
    const first = ((await (await upload()).json()) as { version: VersionView }).version;
    const second = ((await (await upload()).json()) as { version: VersionView }).version;
    expect(second.versionNumber).toBe(2);
    const versions = (await reel()).versions;
    expect(versions.map((v) => [v.versionNumber, v.state])).toEqual([
      [2, "needs_review"],
      [1, "needs_review"],
    ]);
    expect(versions[1]!.id).toBe(first.id);
  });
});

describe("R7c rejects Reels that don't match what they claim to show", () => {
  const rejected = async (response: Response, status: number, code: string) => {
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
    expect(outputObjects()).toEqual([]);
    expect(versionCount()).toBe(0);
  };

  test("length doesn't match the photo count", async () => rejected(await upload([photoIds[0]!]), 400, "wrong_duration"));
  test("wrong size for the template", async () => rejected(await upload(photoIds, "reel-1080x1080-2photos.mp4"), 400, "wrong_dimensions"));
  test("an audio track", async () => rejected(await upload(photoIds, "reel-1080x1920-with-audio.mp4"), 400, "unexpected_tracks"));
  test("a photo from another listing", async () => {
    const otherProperty = await createProperty(app, account.cookie, { title: "Elsewhere" });
    const otherPhoto = await uploadPhoto(app, account.cookie, otherProperty);
    await rejected(await upload([photoIds[0]!, otherPhoto]), 400, "invalid_photos");
  });
  test("the same photo twice", async () => rejected(await upload([photoIds[0]!, photoIds[0]!]), 400, "invalid_photos"));
  test("no photo list", async () => {
    const form = new FormData();
    form.append("video", new File([videoFixture("reel-1080x1920-2photos.mp4")], "reel.mp4", { type: "video/mp4" }));
    await rejected(await app.request(planUrl((await reel()).id), { method: "POST", cookie: account.cookie, body: form }), 400, "invalid_photos");
  });
  test("no video", async () => {
    const form = new FormData();
    form.append("photoIds", JSON.stringify(photoIds));
    await rejected(await app.request(planUrl((await reel()).id), { method: "POST", cookie: account.cookie, body: form }), 400, "invalid_upload");
  });
  test("an asset that isn't a slideshow Reel", async () => {
    const social = (await view()).assets.find((a) => a.assetType === "social_post")!;
    await rejected(await app.request(planUrl(social.id), { method: "POST", cookie: account.cookie, body: reelForm(photoIds) }), 400, "not_slideshow");
    expect((await app.request(planUrl(social.id), { cookie: account.cookie })).status).toBe(400);
  });
});

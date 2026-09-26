import { beforeEach, describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders } from "../support/providers";

type VersionView = { id: string; state: string; text: string | null; media: { url: string } | null };
type AssetView = { id: string; slotKey: string; assetType: string; versions: VersionView[] };
type CampaignView = { assets: AssetView[] };

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;
let campaignId: string;

const base = () => `/api/campaigns/${campaignId}`;
const view = async () => (await (await app.request(base(), { cookie: account.cookie })).json()) as CampaignView;
const approve = (a: AssetView, v: VersionView) => app.request(`${base()}/assets/${a.id}/versions/${v.id}/approve`, { method: "POST", cookie: account.cookie });
const pack = () => app.request(`${base()}/pack`, { cookie: account.cookie });

async function unzip(response: Response): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await response.arrayBuffer()));
}

beforeEach(async () => {
  app = createTestApp({ providers: fakeProviders().registry });
  account = await signUp(app);
  const propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way, Harpenden", bedrooms: 3 });
  await uploadPhoto(app, account.cookie, propertyId);
  await uploadPhoto(app, account.cookie, propertyId, "photo-800x600.png", "image/png");
  campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: account.cookie, body: "{}" })).json()) as { id: string }).id;
  await app.request(`${base()}/generate`, { method: "POST", cookie: account.cookie });
  await drainQueue(app);
});

describe("AT-14 marketing pack", () => {
  test("nothing approved yet: 409", async () => {
    const response = await pack();
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("nothing_approved");
  });

  test("contains every approved asset in the agreed folder structure", async () => {
    for (const a of (await view()).assets) await approve(a, a.versions[0]!);
    const response = await pack();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="12-orchard-way-harpenden-marketing-pack.zip"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const files = await unzip(response);
    expect(Object.keys(files).sort()).toEqual(
      [
        "12-orchard-way-harpenden/README.txt",
        "12-orchard-way-harpenden/Photography/12-orchard-way-harpenden-photo-01.png",
        "12-orchard-way-harpenden/Photography/12-orchard-way-harpenden-photo-02.png",
        "12-orchard-way-harpenden/Social/12-orchard-way-harpenden-social-square.jpg",
        "12-orchard-way-harpenden/Social/12-orchard-way-harpenden-social-portrait.jpg",
        "12-orchard-way-harpenden/Stories/12-orchard-way-harpenden-story.jpg",
        "12-orchard-way-harpenden/Reels/12-orchard-way-harpenden-reel.mp4",
        "12-orchard-way-harpenden/Copy/headline.txt",
        "12-orchard-way-harpenden/Copy/supporting-copy.txt",
        "12-orchard-way-harpenden/Copy/instagram-caption.txt",
        "12-orchard-way-harpenden/Copy/facebook-copy.txt",
        "12-orchard-way-harpenden/Copy/linkedin-copy.txt",
        "12-orchard-way-harpenden/Copy/hashtags.txt",
        "12-orchard-way-harpenden/Copy/cta.txt",
      ].sort(),
    );
    expect(strFromU8(files["12-orchard-way-harpenden/Copy/headline.txt"]!)).toBe("Book a viewing of 12 Orchard Way, Harpenden.\n");
    const readme = strFromU8(files["12-orchard-way-harpenden/README.txt"]!);
    expect(readme).toContain("12 Orchard Way, Harpenden");
    expect(readme).toContain("We enhance the photograph. We never change the property.");
  });

  test("file bytes are exactly the stored outputs", async () => {
    const campaign = await view();
    const photo = campaign.assets.find((a) => a.assetType === "enhanced_photo")!;
    await approve(photo, photo.versions[0]!);
    const files = await unzip(await pack());
    const [path] = Object.keys(files).filter((p) => p.includes("/Photography/"));
    const key = `org/${account.organisation.id}/output/${photo.versions[0]!.id}`;
    expect(files[path!]).toEqual(app.store.objects.get(key)!.bytes);
  });

  test("only final versions: unapproved, rejected and superseded content is excluded", async () => {
    const campaign = await view();
    const headline = campaign.assets.find((a) => a.slotKey === "copy:headline")!;
    const cta = campaign.assets.find((a) => a.slotKey === "copy:cta")!;
    await approve(headline, headline.versions[0]!);
    await app.request(`${base()}/assets/${cta.id}/versions/${cta.versions[0]!.id}/reject`, { method: "POST", cookie: account.cookie });
    // A newer draft in review must not replace the approved v1.
    await app.request(`${base()}/assets/${headline.id}/text`, { method: "PUT", cookie: account.cookie, body: JSON.stringify({ text: "Draft headline" }) });
    const files = await unzip(await pack());
    const paths = Object.keys(files);
    expect(paths.filter((p) => !p.endsWith("README.txt"))).toEqual(["12-orchard-way-harpenden/Copy/headline.txt"]);
    expect(strFromU8(files["12-orchard-way-harpenden/Copy/headline.txt"]!)).toBe("Book a viewing of 12 Orchard Way, Harpenden.\n");
  });

  test("discarded assets are excluded", async () => {
    const campaign = await view();
    const reel = campaign.assets.find((a) => a.assetType === "reel")!;
    const headline = campaign.assets.find((a) => a.slotKey === "copy:headline")!;
    await approve(reel, reel.versions[0]!);
    await approve(headline, headline.versions[0]!);
    await app.request(`${base()}/assets/${reel.id}/discard`, { method: "POST", cookie: account.cookie });
    const files = await unzip(await pack());
    expect(Object.keys(files).some((p) => p.includes("/Reels/"))).toBe(false);
  });

  test("records an audit event", async () => {
    const headline = (await view()).assets.find((a) => a.slotKey === "copy:headline")!;
    await approve(headline, headline.versions[0]!);
    await pack();
    expect(app.db.raw.query("SELECT action FROM audit_events WHERE subject_id = ? AND action = 'campaign.pack_downloaded'").all(campaignId)).toHaveLength(1);
  });
});

describe("AT-11 individual downloads", () => {
  test("a signed attachment link downloads one version with a sensible filename", async () => {
    const photo = (await view()).assets.find((a) => a.assetType === "enhanced_photo")!;
    const response = await app.request(`${base()}/assets/${photo.id}/versions/${photo.versions[0]!.id}/download`, { cookie: account.cookie });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const download = await app.request(url);
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Disposition")).toMatch(/^attachment; filename="12-orchard-way-harpenden-photo-[a-z0-9-]+-v1\.png"$/);
  });

  test("text versions have no file to download", async () => {
    const headline = (await view()).assets.find((a) => a.slotKey === "copy:headline")!;
    expect((await app.request(`${base()}/assets/${headline.id}/versions/${headline.versions[0]!.id}/download`, { cookie: account.cookie })).status).toBe(404);
  });
});

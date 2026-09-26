import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders } from "../support/providers";

type VersionView = { id: string; versionNumber: number; state: string; origin: string; text: string | null; approvedAt: string | null };
type AssetView = { id: string; slotKey: string; assetType: string; finalVersionId: string | null; versions: VersionView[] };
type CampaignView = { id: string; status: string; assets: AssetView[]; progress: Array<{ key: string; status: string }> };

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;
let campaignId: string;

const base = () => `/api/campaigns/${campaignId}`;
const view = async () => (await (await app.request(base(), { cookie: account.cookie })).json()) as CampaignView;
const asset = async (slot: string) => (await view()).assets.find((a) => a.slotKey === slot)!;
const post = (path: string, body?: unknown) =>
  app.request(`${base()}${path}`, { method: "POST", cookie: account.cookie, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const approve = (a: AssetView, v: VersionView) => post(`/assets/${a.id}/versions/${v.id}/approve`);
const reject = (a: AssetView, v: VersionView) => post(`/assets/${a.id}/versions/${v.id}/reject`);
const editText = (a: AssetView, text: string) =>
  app.request(`${base()}/assets/${a.id}/text`, { method: "PUT", cookie: account.cookie, body: JSON.stringify({ text }) });

beforeEach(async () => {
  app = createTestApp({ providers: fakeProviders().registry });
  account = await signUp(app);
  const propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way", bedrooms: 3 });
  await uploadPhoto(app, account.cookie, propertyId);
  campaignId = ((await (await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: account.cookie, body: "{}" })).json()) as { id: string }).id;
  await app.request(`${base()}/generate`, { method: "POST", cookie: account.cookie });
  await drainQueue(app);
});

describe("AT-10 approval makes a version final", () => {
  test("approving a version in review records who and when, and makes it final", async () => {
    const headline = await asset("copy:headline");
    const response = await approve(headline, headline.versions[0]!);
    expect(response.status).toBe(200);
    const after = await asset("copy:headline");
    expect(after.versions[0]!.state).toBe("approved");
    expect(after.versions[0]!.approvedAt).not.toBeNull();
    expect(after.finalVersionId).toBe(headline.versions[0]!.id);
    const row = app.db.raw.query("SELECT approved_by FROM asset_versions WHERE id = ?").get(headline.versions[0]!.id) as { approved_by: string };
    expect(row.approved_by).toBe(account.user.id);
    const audit = app.db.raw.query("SELECT action FROM audit_events WHERE subject_id = ?").all(headline.versions[0]!.id);
    expect(audit).toContainEqual({ action: "asset_version.approved" });
  });

  test("rejected versions are never final", async () => {
    const headline = await asset("copy:headline");
    expect((await reject(headline, headline.versions[0]!)).status).toBe(200);
    const after = await asset("copy:headline");
    expect(after.versions[0]!.state).toBe("rejected");
    expect(after.finalVersionId).toBeNull();
  });

  test("the campaign completes when every asset has an approved version", async () => {
    for (const a of (await view()).assets) expect((await approve(a, a.versions[0]!)).status).toBe(200);
    const campaign = await view();
    expect(campaign.status).toBe("completed");
    expect(campaign.progress.find((g) => g.key === "pack")?.status).toBe("complete");
  });
});

describe("AT-07/AT-18 review transitions are enforced", () => {
  test("only versions in review can be approved or rejected", async () => {
    const headline = await asset("copy:headline");
    const v1 = headline.versions[0]!;
    await approve(headline, v1);
    for (const response of [await approve(headline, v1), await reject(headline, v1)]) {
      expect(response.status).toBe(409);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("invalid_transition");
    }
    expect((await asset("copy:headline")).versions[0]!.state).toBe("approved");
  });

  test("versions still generating cannot be approved", async () => {
    const headline = await asset("copy:headline");
    await app.request(`${base()}/assets/${headline.id}/regenerate`, { method: "POST", cookie: account.cookie });
    const queued = (await asset("copy:headline")).versions[0]!;
    expect(queued.state).toBe("queued");
    expect((await approve(headline, queued)).status).toBe(409);
  });

  test("a version must belong to the asset in the URL", async () => {
    const headline = await asset("copy:headline");
    const cta = await asset("copy:cta");
    expect((await approve(headline, cta.versions[0]!)).status).toBe(404);
  });
});

describe("AT-17/AT-18 text edits create new versions", () => {
  test("editing copy creates a manual version in review and leaves the approved version unchanged", async () => {
    const headline = await asset("copy:headline");
    const v1 = headline.versions[0]!;
    await approve(headline, v1);
    const response = await editText(headline, "  A bright three bedroom home  ");
    expect(response.status).toBe(201);
    const body = (await response.json()) as { version: VersionView; warnings: unknown[] };
    expect(body.version).toMatchObject({ versionNumber: 2, state: "needs_review", origin: "manual_edit", text: "A bright three bedroom home" });
    expect(body.warnings).toEqual([]);
    const after = await asset("copy:headline");
    expect(after.versions.map((v) => [v.versionNumber, v.state, v.text])).toEqual([
      [2, "needs_review", "A bright three bedroom home"],
      [1, "approved", v1.text],
    ]);
    expect(after.finalVersionId).toBe(v1.id);
  });

  test("edits are checked against recorded facts and warn without blocking", async () => {
    const headline = await asset("copy:headline");
    const response = await editText(headline, "Four bedroom home with sea views");
    expect(response.status).toBe(201);
    const { warnings } = (await response.json()) as { warnings: Array<{ category: string }> };
    expect(warnings.map((w) => w.category).sort()).toEqual(["bedrooms", "views"]);
  });

  test("text must fit the template and only copy assets are editable", async () => {
    const headline = await asset("copy:headline");
    expect((await editText(headline, "")).status).toBe(400);
    expect((await editText(headline, "x".repeat(81))).status).toBe(400);
    const photo = (await view()).assets.find((a) => a.assetType === "enhanced_photo")!;
    const response = await editText(photo, "Nice photo");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("not_editable");
  });

  test("cannot edit while a generation is in progress", async () => {
    const headline = await asset("copy:headline");
    await app.request(`${base()}/assets/${headline.id}/regenerate`, { method: "POST", cookie: account.cookie });
    const response = await editText(headline, "New headline");
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("generation_in_progress");
  });
});

describe("discard", () => {
  test("discarding an asset hides it from the campaign and its progress while keeping its versions", async () => {
    const reel = await asset("reel:slideshow");
    await approve(reel, reel.versions[0]!);
    expect((await post(`/assets/${reel.id}/discard`)).status).toBe(200);
    const campaign = await view();
    expect(campaign.assets.some((a) => a.id === reel.id)).toBe(false);
    expect(campaign.progress.find((g) => g.key === "reel")?.status).toBe("not_started");
    const row = app.db.raw.query("SELECT state FROM asset_versions WHERE id = ?").get(reel.versions[0]!.id) as { state: string };
    expect(row.state).toBe("approved");
  });

  test("discarded assets cannot be approved, edited or regenerated", async () => {
    const headline = await asset("copy:headline");
    await post(`/assets/${headline.id}/discard`);
    expect((await approve(headline, headline.versions[0]!)).status).toBe(404);
    expect((await editText(headline, "Hello")).status).toBe(404);
    expect((await post(`/assets/${headline.id}/regenerate`)).status).toBe(404);
  });
});

describe("edit warnings ignore the agency's own name", () => {
  test("a brand name containing claim words is not flagged", async () => {
    app.db.raw.run("UPDATE brand_settings SET agency_name = 'Garden City Estates'");
    const headline = (await view()).assets.find((a) => a.slotKey === "copy:headline")!;
    const response = await editText(headline, "Garden City Estates presents a lovely home");
    expect(((await response.json()) as { warnings: unknown[] }).warnings).toEqual([]);
  });
});

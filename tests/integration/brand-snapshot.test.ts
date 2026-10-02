import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createProductionProviders } from "../../apps/web/server/providers";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fontFixtures, solidPng } from "../support/fixtures";
import { fakeProviders } from "../support/providers";
import { renderAssetsFromDisk } from "../support/render-assets";

type VersionView = { id: string; state: string; text: string | null; versionNumber: number };
type AssetView = {
  id: string;
  slotKey: string;
  assetType: string;
  templateId: string;
  templateVersion: number;
  available: boolean;
  unavailableReason: string | null;
  unavailableMessage: string | null;
  versions: VersionView[];
};
type CampaignView = { id: string; status: string; assets: AssetView[]; progress: Array<{ key: string; status: string }> };

let app: TestApp;
let fakes: ReturnType<typeof fakeProviders>;
let owner: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;

const original = {
  agencyName: "Orchard & Co",
  contactPhone: "01582 760000",
  contactEmail: "hello@orchard.test",
  website: "https://orchard.test",
  officeAddress: "1 High Street\nHarpenden",
  primaryColour: "#1d2433",
  secondaryColour: "#f6f1e8",
  headingFont: null as string | null,
  bodyFont: null as string | null,
  toneOfVoice: null as string | null,
  preferredTemplates: {} as Record<string, string>,
};
const changed = { ...original, agencyName: "Changed Name", contactPhone: "020 7946 0000", contactEmail: "new@changed.test", website: "https://changed.test", primaryColour: "#aa0000" };

async function start(registry = fakes.registry) {
  app = createTestApp({ providers: registry });
  owner = await signUp(app, { agencyName: "Orchard Estates" });
  propertyId = await createProperty(app, owner.cookie, { title: "12 Orchard Way", bedrooms: 3, price: { amount: 650000, qualifier: "guide_price" } });
  await uploadPhoto(app, owner.cookie, propertyId);
}

beforeEach(async () => {
  fakes = fakeProviders();
  await start();
});

const save = async (settings: Record<string, unknown>) => {
  const response = await app.request("/api/brand-settings", { method: "PUT", cookie: owner.cookie, body: JSON.stringify(settings) });
  if (response.status !== 200) throw new Error(`save failed: ${response.status} ${await response.text()}`);
};
const fileForm = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
};
const uploadLogo = async (bytes: Uint8Array<ArrayBuffer>) => {
  const response = await app.request("/api/brand-settings/logo", { method: "POST", cookie: owner.cookie, body: fileForm(bytes, "logo.png", "image/png") });
  if (response.status !== 201) throw new Error(`logo upload failed: ${response.status}`);
};
const uploadFont = async (bytes: Uint8Array<ArrayBuffer>, name: string) => {
  const response = await app.request("/api/brand-settings/fonts", { method: "POST", cookie: owner.cookie, body: fileForm(bytes, name, "font/ttf", { rightsConfirmed: "true" }) });
  if (response.status !== 201) throw new Error(`font upload failed: ${response.status} ${await response.text()}`);
  const fonts = ((await response.json()) as { fonts: { custom: Array<{ id: string; ref: string }> } }).fonts.custom;
  return fonts[fonts.length - 1]!;
};
const createCampaign = async () => {
  const response = await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: owner.cookie, body: "{}" });
  if (response.status !== 201) throw new Error(`campaign create failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as CampaignView;
};
const view = async (id: string) => (await (await app.request(`/api/campaigns/${id}`, { cookie: owner.cookie })).json()) as CampaignView;
const generate = async (id: string) => {
  const response = await app.request(`/api/campaigns/${id}/generate`, { method: "POST", cookie: owner.cookie });
  const body = (await response.json()) as { queued?: number; unavailable?: string[] };
  await drainQueue(app);
  return { ...body, httpStatus: response.status };
};
const bytesOf = (buffer: ArrayBuffer | Uint8Array | null | undefined) => (buffer ? [...new Uint8Array(buffer instanceof Uint8Array ? buffer : buffer)] : null);
const snapshotOf = (campaignId: string) =>
  JSON.parse((app.db.raw.query("SELECT brand_snapshot_json AS j FROM campaigns WHERE id = ?").get(campaignId) as { j: string }).j) as Record<string, unknown>;

describe("AT-22 a campaign captures brand settings when it is created (AC20)", () => {
  test("the snapshot holds the settings as they were, without tone", async () => {
    await save({ ...original, toneOfVoice: "Warm TONE-MARKER", preferredTemplates: { "story:primary": "story-full" } });
    await uploadLogo(solidPng(64, 64));
    const campaign = await createCampaign();
    const snapshot = snapshotOf(campaign.id);
    expect(snapshot).toMatchObject({ agencyName: "Orchard & Co", contactPhone: "01582 760000", primaryColour: "#1d2433", preferredTemplates: { "story:primary": "story-full" } });
    expect(snapshot.logoId).toBeString();
    expect(snapshot).not.toHaveProperty("toneOfVoice");
    expect(JSON.stringify(snapshot)).not.toContain("TONE-MARKER");
  });

  test("jobs that run after the settings change still use the captured colours, contact details, logo and fonts", async () => {
    const firstLogo = solidPng(64, 64, [10, 20, 30]);
    await uploadLogo(firstLogo);
    const font = await uploadFont(fontFixtures.ttf(), "Brand.ttf");
    await save({ ...original, headingFont: font.ref, bodyFont: "preset:lato" });
    const campaign = await createCampaign();

    // Everything changes while the campaign's jobs are still waiting.
    await uploadLogo(solidPng(96, 96, [200, 0, 0]));
    const otherFont = await uploadFont(fontFixtures.otf(), "Other.otf");
    await save({ ...changed, headingFont: otherFont.ref, bodyFont: "preset:open-sans" });

    await generate(campaign.id);
    expect(fakes.renderer.calls.length).toBe(3);
    for (const call of fakes.renderer.calls) {
      expect(call.brand).toMatchObject({
        agencyName: "Orchard & Co",
        contactPhone: "01582 760000",
        contactEmail: "hello@orchard.test",
        website: "https://orchard.test",
        officeAddress: "1 High Street\nHarpenden",
        primaryColour: "#1d2433",
        secondaryColour: "#f6f1e8",
      });
      expect(bytesOf(call.brand.logo?.bytes)).toEqual([...firstLogo]);
      expect(call.brand.logo?.contentType).toBe("image/png");
      expect(bytesOf(call.brand.headingFont?.regular)).toEqual([...fontFixtures.ttf()]);
      // A custom font is one file: it serves as its own bold.
      expect(call.brand.headingFont?.bold).toBeNull();
      const lato = (weight: string) => [...readFileSync(join(import.meta.dir, `../../apps/web/client/public/fonts/lato/lato-${weight}.woff`))];
      expect(bytesOf(call.brand.bodyFont?.regular)).toEqual(lato("regular"));
      expect(bytesOf(call.brand.bodyFont?.bold)).toEqual(lato("bold"));
    }
    for (const call of fakes.writer.calls) {
      expect(call.brand.agencyName).toBe("Orchard & Co");
      expect(call.brand.contactPhone).toBe("01582 760000");
    }
  });

  test("a campaign created after the change uses the new settings", async () => {
    await save(original);
    await createCampaign();
    await save(changed);
    const later = await createCampaign();
    await generate(later.id);
    expect(fakes.renderer.calls.every((c) => c.brand.agencyName === "Changed Name" && c.brand.primaryColour === "#aa0000")).toBe(true);
  });

  test("unset values stay unset: no logo, no fonts, no invented defaults", async () => {
    const campaign = await createCampaign();
    await generate(campaign.id);
    for (const call of fakes.renderer.calls) {
      expect(call.brand).toMatchObject({ agencyName: "Orchard Estates", contactPhone: null, primaryColour: null, logo: null, headingFont: null, bodyFont: null });
    }
  });

  test("regeneration in a campaign uses that campaign's snapshot, not the live profile", async () => {
    await save(original);
    const campaign = await createCampaign();
    await generate(campaign.id);
    await save(changed);
    const square = (await view(campaign.id)).assets.find((a) => a.slotKey === "social:square")!;
    const rejected = await app.request(`/api/campaigns/${campaign.id}/assets/${square.id}/versions/${square.versions[0]!.id}/reject`, { method: "POST", cookie: owner.cookie });
    expect(rejected.status).toBe(200);
    fakes.renderer.calls.length = 0;
    const response = await app.request(`/api/campaigns/${campaign.id}/assets/${square.id}/regenerate`, { method: "POST", cookie: owner.cookie });
    expect(response.status).toBe(202);
    await drainQueue(app);
    expect(fakes.renderer.calls).toHaveLength(1);
    expect(fakes.renderer.calls[0]!.brand.agencyName).toBe("Orchard & Co");
  });

  test("a campaign from before this change renders with its backfilled snapshot (AC21)", async () => {
    await save(original);
    const campaign = await createCampaign();
    // What migration 0003 writes for an existing campaign.
    const backfilled = { agencyName: "Old Name", contactPhone: null, contactEmail: null, website: null, officeAddress: null, primaryColour: "#112233", secondaryColour: null, headingFont: null, bodyFont: null, logoId: null, preferredTemplates: {} };
    app.db.raw.run("UPDATE campaigns SET brand_snapshot_json = ? WHERE id = ?", [JSON.stringify(backfilled), campaign.id]);
    await save(changed);
    await generate(campaign.id);
    expect(fakes.renderer.calls.every((c) => c.brand.agencyName === "Old Name" && c.brand.primaryColour === "#112233")).toBe(true);
  });

  test("a campaign with no snapshot renders unbranded; it never falls back to the live profile", async () => {
    await save(original);
    const campaign = await createCampaign();
    app.db.raw.run("UPDATE campaigns SET brand_snapshot_json = NULL WHERE id = ?", [campaign.id]);
    await generate(campaign.id);
    expect(fakes.renderer.calls.every((c) => c.brand.agencyName === null && c.brand.primaryColour === null)).toBe(true);
  });

  test("a font removed from selection still renders in a campaign that captured it (AC18a)", async () => {
    const font = await uploadFont(fontFixtures.ttf(), "Brand.ttf");
    await save({ ...original, headingFont: font.ref });
    const campaign = await createCampaign();
    expect((await app.request(`/api/brand-settings/fonts/${font.id}`, { method: "DELETE", cookie: owner.cookie })).status).toBe(200);
    await generate(campaign.id);
    expect(fakes.renderer.calls).toHaveLength(3);
    for (const call of fakes.renderer.calls) expect(bytesOf(call.brand.headingFont?.regular)).toEqual([...fontFixtures.ttf()]);
  });
});

describe("AT-22 preferred templates on new campaigns", () => {
  const pick = (campaign: CampaignView, slot: string) => campaign.assets.find((a) => a.slotKey === slot)!;

  test("a preferred template is recorded with its newest version; other slots use the default (AC26, AC27)", async () => {
    await save({ ...original, preferredTemplates: { "social:square": "social-square-full" } });
    const campaign = await createCampaign();
    expect(pick(campaign, "social:square")).toMatchObject({ templateId: "social-square-full", templateVersion: 1, available: true, unavailableReason: null });
    expect(pick(campaign, "social:portrait")).toMatchObject({ templateId: "social-portrait", templateVersion: 2, available: true });
    expect(pick(campaign, "story:primary")).toMatchObject({ templateId: "story", templateVersion: 2 });
    await generate(campaign.id);
    expect(fakes.renderer.calls.map((c) => `${c.template.id}@${c.template.version}`).sort()).toEqual(["social-portrait@2", "social-square-full@1", "story@2"]);
  });

  test("an unavailable preference is reported, nothing is substituted, and the rest proceed (AC28)", async () => {
    // A preference saved when the template existed; the template has since left the catalogue.
    app.db.raw.run("UPDATE brand_settings SET preferred_templates_json = ? WHERE organisation_id = ?", [JSON.stringify({ "social:square": "social-square-2019" }), owner.organisation.id]);
    const campaign = await createCampaign();
    const square = pick(campaign, "social:square");
    expect(square.available).toBe(false);
    expect(square.unavailableReason).toBe("template_unavailable");
    expect(square.unavailableMessage).toMatch(/preferred template.*no longer available/i);
    expect(pick(campaign, "social:portrait").available).toBe(true);

    const result = await generate(campaign.id);
    expect(result.httpStatus).toBe(202);
    expect(result.unavailable).toEqual(["social:square"]);
    expect(result.queued).toBe(11);

    const after = await view(campaign.id);
    expect(pick(after, "social:square").versions).toEqual([]);
    // Only the portrait post and the story were rendered: no other template stood in for the square post.
    expect(fakes.renderer.calls.map((c) => c.template.id).sort()).toEqual(["social-portrait", "story"]);
    expect(pick(after, "social:portrait").versions[0]!.state).toBe("needs_review");

    const regenerate = await app.request(`/api/campaigns/${campaign.id}/assets/${square.id}/regenerate`, { method: "POST", cookie: owner.cookie });
    expect(regenerate.status).toBe(409);
    expect(fakes.renderer.calls).toHaveLength(2);
  });

  test("the unavailability belongs to the campaign: fixing the preference later does not change it", async () => {
    app.db.raw.run("UPDATE brand_settings SET preferred_templates_json = ? WHERE organisation_id = ?", [JSON.stringify({ "social:square": "social-square-2019" }), owner.organisation.id]);
    const campaign = await createCampaign();
    await save({ ...original, preferredTemplates: { "social:square": "social-square-full" } });
    expect(pick(await view(campaign.id), "social:square").available).toBe(false);
    expect(pick(await createCampaign(), "social:square")).toMatchObject({ templateId: "social-square-full", available: true });
  });

  test("Brand Settings says a saved preference is unavailable and lists the choices (AC29)", async () => {
    app.db.raw.run("UPDATE brand_settings SET preferred_templates_json = ? WHERE organisation_id = ?", [JSON.stringify({ "social:square": "social-square-2019", "story:primary": "story-full" }), owner.organisation.id]);
    const body = (await (await app.request("/api/brand-settings", { cookie: owner.cookie })).json()) as {
      templates: Array<{ slot: string; label: string; options: Array<{ id: string; label: string }>; preferred: string | null; preferredAvailable: boolean }>;
    };
    expect(body.templates.map((t) => t.slot)).toEqual(["social:square", "social:portrait", "story:primary"]);
    const square = body.templates[0]!;
    expect(square).toMatchObject({ label: "Social post (square)", preferred: "social-square-2019", preferredAvailable: false });
    expect(square.options).toEqual([
      { id: "social-square", label: "Brand panel" },
      { id: "social-square-full", label: "Full photo" },
    ]);
    expect(body.templates[1]).toMatchObject({ preferred: null, preferredAvailable: true });
    expect(body.templates[2]).toMatchObject({ preferred: "story-full", preferredAvailable: true });
  });
});

describe("AT-22 tone is stored only; copy uses captured agency and contact details (AC19, AC25)", () => {
  const TONE = "Warm and effusive TONE-MARKER";

  test("tone never reaches a provider and is never recorded in generation parameters", async () => {
    await save({ ...original, toneOfVoice: TONE });
    const campaign = await createCampaign();
    await generate(campaign.id);
    expect(fakes.writer.calls.length).toBe(7);
    for (const call of [...fakes.writer.calls, ...fakes.renderer.calls]) {
      expect(call.brand).not.toHaveProperty("toneOfVoice");
      expect(JSON.stringify({ ...call, brand: { ...call.brand, logo: null, headingFont: null, bodyFont: null }, photo: undefined })).not.toContain("TONE-MARKER");
    }
    const recorded = app.db.raw.query("SELECT request_json FROM generation_jobs").all() as Array<{ request_json: string }>;
    const outputs = app.db.raw.query("SELECT parameters_json FROM asset_versions").all() as Array<{ parameters_json: string }>;
    expect(outputs.length).toBeGreaterThan(0);
    for (const text of [...recorded.map((r) => r.request_json), ...outputs.map((o) => o.parameters_json)]) {
      expect(text).not.toContain("TONE-MARKER");
      expect(text).not.toContain("toneOfVoice");
    }
    // The preference itself is still stored on the profile.
    expect(((await (await app.request("/api/brand-settings", { cookie: owner.cookie })).json()) as { settings: { toneOfVoice: string } }).settings.toneOfVoice).toBe(TONE);
  });

  test("generation parameters record font references and whether a logo was used, never file bytes", async () => {
    await uploadLogo(solidPng(64, 64));
    await save({ ...original, headingFont: "preset:montserrat" });
    await generate((await createCampaign()).id);
    const outputs = app.db.raw.query("SELECT parameters_json FROM asset_versions").all() as Array<{ parameters_json: string }>;
    const withBrand = outputs.map((o) => JSON.parse(o.parameters_json) as { brand?: Record<string, unknown> }).filter((p) => p.brand);
    expect(withBrand.length).toBeGreaterThan(0);
    for (const p of withBrand) {
      expect(p.brand).toMatchObject({ agencyName: "Orchard & Co", logo: true, headingFont: "preset:montserrat", bodyFont: null });
    }
    for (const o of outputs) expect(o.parameters_json.length).toBeLessThan(4000);
  });

  test("with the production copywriter, copy is identical with and without a tone preference (AC19)", async () => {
    const texts = async (tone: string | null) => {
      await start(createProductionProviders(renderAssetsFromDisk()));
      await save({ ...original, toneOfVoice: tone });
      const campaign = await createCampaign();
      await generate(campaign.id);
      const assets = (await view(campaign.id)).assets.filter((a) => a.assetType === "copy");
      expect(assets).toHaveLength(7);
      return Object.fromEntries(assets.map((a) => [a.slotKey, a.versions[0]!.text]));
    };
    const withTone = await texts(TONE);
    const without = await texts(null);
    expect(withTone).toEqual(without);
    expect(JSON.stringify(withTone)).not.toContain("TONE-MARKER");
  });

  test("copy uses the captured agency and contact details and passes the copy-truth check (AC25)", async () => {
    await start(createProductionProviders(renderAssetsFromDisk()));
    await save(original);
    const campaign = await createCampaign();
    await save(changed);
    await generate(campaign.id);
    const copy = (await view(campaign.id)).assets.filter((a) => a.assetType === "copy");
    // Every copy asset passed ListingBoost's own truth check and is waiting for review.
    expect(copy.map((a) => a.versions[0]!.state)).toEqual(Array(7).fill("needs_review"));
    const all = copy.map((a) => a.versions[0]!.text).join("\n");
    expect(all).toContain("Orchard & Co");
    expect(all).toContain("01582 760000");
    expect(all).not.toContain("Changed Name");
    expect(all).not.toContain("020 7946 0000");
  });

  test("manual-edit warnings allow the campaign's captured brand strings, not the live ones", async () => {
    await save({ ...original, agencyName: "Garden City Estates" });
    const campaign = await createCampaign();
    await generate(campaign.id);
    await save(changed);
    const cta = (await view(campaign.id)).assets.find((a) => a.slotKey === "copy:cta")!;
    const edit = async (text: string) => {
      const response = await app.request(`/api/campaigns/${campaign.id}/assets/${cta.id}/text`, { method: "PUT", cookie: owner.cookie, body: JSON.stringify({ text }) });
      expect(response.status).toBe(201);
      return ((await response.json()) as { warnings: unknown[] }).warnings;
    };
    // "Garden" would be an unsupported property claim if the agency name were not allowed for.
    expect(await edit("Call Garden City Estates to arrange a viewing.")).toEqual([]);
    expect((await edit("Lovely garden. Call us to arrange a viewing.")).length).toBeGreaterThan(0);
  });
});

describe("AT-22 approved assets never change when the brand does (AC31, AC32)", () => {
  const approvedState = () => ({
    versions: app.db.raw.query("SELECT * FROM asset_versions WHERE state = 'approved' ORDER BY id").all(),
    outputs: app.db.raw
      .query("SELECT o.* FROM generation_outputs o JOIN generation_jobs j ON j.id = o.job_id JOIN asset_versions v ON v.id = j.version_id WHERE v.state = 'approved' ORDER BY o.id")
      .all(),
    assets: app.db.raw.query("SELECT * FROM campaign_assets ORDER BY id").all(),
    snapshot: app.db.raw.query("SELECT id, brand_snapshot_json FROM campaigns ORDER BY id").all(),
  });
  const outputBytes = () =>
    Object.fromEntries([...app.store.objects.entries()].filter(([key]) => key.includes("/output/")).map(([key, object]) => [key, Buffer.from(object.bytes).toString("base64")]));

  async function approvedCampaign() {
    await uploadLogo(solidPng(64, 64, [10, 20, 30]));
    const font = await uploadFont(fontFixtures.ttf(), "Brand.ttf");
    await save({ ...original, headingFont: font.ref, bodyFont: "preset:lato", preferredTemplates: { "social:square": "social-square-full" } });
    const campaign = await createCampaign();
    await generate(campaign.id);
    for (const asset of (await view(campaign.id)).assets.filter((a) => a.versions[0]?.state === "needs_review")) {
      const response = await app.request(`/api/campaigns/${campaign.id}/assets/${asset.id}/versions/${asset.versions[0]!.id}/approve`, { method: "POST", cookie: owner.cookie });
      expect(response.status).toBe(200);
    }
    return { campaign, font };
  }

  test("every kind of brand change leaves approved versions, their records and their stored bytes identical (AC31)", async () => {
    const { campaign, font } = await approvedCampaign();
    const before = { state: approvedState(), bytes: outputBytes() };
    expect(before.state.versions.length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(before.bytes).length).toBeGreaterThanOrEqual(3);

    await save({ ...changed, toneOfVoice: "Brisk", headingFont: "preset:montserrat", bodyFont: null, preferredTemplates: { "social:square": "social-square", "story:primary": "story-full" } });
    await uploadLogo(solidPng(96, 96, [200, 0, 0]));
    const logos = ((await (await app.request("/api/brand-settings", { cookie: owner.cookie })).json()) as { previousLogos: Array<{ id: string }> }).previousLogos;
    expect((await app.request(`/api/brand-settings/logos/${logos[0]!.id}/restore`, { method: "POST", cookie: owner.cookie })).status).toBe(200);
    await uploadFont(fontFixtures.otf(), "Other.otf");
    expect((await app.request(`/api/brand-settings/fonts/${font.id}`, { method: "DELETE", cookie: owner.cookie })).status).toBe(200);

    expect(approvedState()).toEqual(before.state);
    expect(outputBytes()).toEqual(before.bytes);
    expect((await view(campaign.id)).status).toBe("completed");
  });

  test("regenerating after a brand change adds a version and leaves the approved one as the final version (AC32)", async () => {
    const { campaign } = await approvedCampaign();
    const square = (await view(campaign.id)).assets.find((a) => a.slotKey === "social:square")! as AssetView & { finalVersionId: string | null };
    const approvedId = square.versions[0]!.id;
    expect(square.finalVersionId).toBe(approvedId);
    const before = { state: approvedState(), bytes: outputBytes() };

    await save(changed);
    const response = await app.request(`/api/campaigns/${campaign.id}/assets/${square.id}/regenerate`, { method: "POST", cookie: owner.cookie });
    expect(response.status).toBe(202);
    await drainQueue(app);

    const after = (await view(campaign.id)).assets.find((a) => a.slotKey === "social:square")! as AssetView & { finalVersionId: string | null };
    expect(after.versions.map((v) => [v.versionNumber, v.state])).toEqual([
      [2, "needs_review"],
      [1, "approved"],
    ]);
    // The approved version stays final until someone approves the new one.
    expect(after.finalVersionId).toBe(approvedId);
    expect(approvedState()).toEqual(before.state);
    for (const [key, bytes] of Object.entries(before.bytes)) expect(outputBytes()[key]).toBe(bytes);
    expect(Object.keys(outputBytes()).length).toBe(Object.keys(before.bytes).length + 1);
  });
});

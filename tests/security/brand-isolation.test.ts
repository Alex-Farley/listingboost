import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, signUp, signUpMember, type TestApp } from "../support/app";
import { solidPng } from "../support/fixtures";

let app: TestApp;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;

const settings = { agencyName: "Alice Estates", contactPhone: "01582 111111", toneOfVoice: "Secret tone", preferredTemplates: {} };

beforeEach(async () => {
  app = createTestApp();
  alice = await signUp(app, { agencyName: "Alice Estates" });
  bob = await signUp(app, { agencyName: "Bob Lettings" });
  await app.request("/api/brand-settings", { method: "PUT", cookie: alice.cookie, body: JSON.stringify(settings) });
});

const stored = (organisationId: string) =>
  app.db.raw.query("SELECT agency_name, contact_phone, tone_of_voice, logo_id, heading_font FROM brand_settings WHERE organisation_id = ?").get(organisationId);

describe("AT-22 brand settings: tenant isolation", () => {
  test("one organisation never sees another's settings", async () => {
    const response = await app.request("/api/brand-settings", { cookie: bob.cookie });
    const text = await response.text();
    expect(text).not.toContain("Alice");
    expect(text).not.toContain("01582 111111");
    expect(text).not.toContain("Secret tone");
  });

  test("a save only ever changes the signed-in organisation, whatever the body says", async () => {
    const before = stored(alice.organisation.id);
    const response = await app.request("/api/brand-settings", {
      method: "PUT",
      cookie: bob.cookie,
      body: JSON.stringify({ agencyName: "Hijacked", organisationId: alice.organisation.id, organisation_id: alice.organisation.id, preferredTemplates: {} }),
    });
    expect(response.status).toBe(200);
    expect(stored(alice.organisation.id)).toEqual(before);
    expect((stored(bob.organisation.id) as { agency_name: string }).agency_name).toBe("Hijacked");
  });

  test("writes need the CSRF header and a same-origin request", async () => {
    const body = JSON.stringify({ agencyName: "X", preferredTemplates: {} });
    expect((await app.request("/api/brand-settings", { method: "PUT", cookie: alice.cookie, body, csrf: false })).status).toBe(403);
    expect((await app.request("/api/brand-settings", { method: "PUT", cookie: alice.cookie, body, origin: "https://evil.test" })).status).toBe(403);
  });
});

describe("AT-22 brand settings: members cannot change them (AC4)", () => {
  test("a member's save is refused as forbidden with a plain reason and nothing changes", async () => {
    const member = await signUpMember(app, alice);
    const before = stored(alice.organisation.id);
    const response = await app.request("/api/brand-settings", { method: "PUT", cookie: member.cookie, body: JSON.stringify({ ...settings, agencyName: "Member edit" }) });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toMatch(/owner/i);
    expect(stored(alice.organisation.id)).toEqual(before);
  });

  test("a member's invalid save is still refused as forbidden, not validated", async () => {
    const member = await signUpMember(app, alice);
    const response = await app.request("/api/brand-settings", { method: "PUT", cookie: member.cookie, body: JSON.stringify({ primaryColour: "nope" }) });
    expect(response.status).toBe(403);
  });
});

describe("AT-22 brand logos: isolation and roles (AC2, AC4)", () => {
  const logoForm = () => {
    const form = new FormData();
    form.append("file", new File([solidPng(64, 64)], "logo.png", { type: "image/png" }));
    return form;
  };
  const uploadLogo = async (cookie: string) => {
    const response = await app.request("/api/brand-settings/logo", { method: "POST", cookie, body: logoForm() });
    return { status: response.status, body: (await response.json()) as { logo?: { id: string; url: string } } };
  };

  test("another organisation's logo id cannot be restored: not found, and both organisations are unchanged", async () => {
    const aliceLogo = (await uploadLogo(alice.cookie)).body.logo!;
    const bobLogo = (await uploadLogo(bob.cookie)).body.logo!;
    const response = await app.request(`/api/brand-settings/logos/${aliceLogo.id}/restore`, { method: "POST", cookie: bob.cookie });
    expect(response.status).toBe(404);
    expect((stored(bob.organisation.id) as { logo_id: string }).logo_id).toBe(bobLogo.id);
    expect((stored(alice.organisation.id) as { logo_id: string }).logo_id).toBe(aliceLogo.id);
  });

  test("another organisation's logos never appear in a settings response", async () => {
    const aliceLogo = (await uploadLogo(alice.cookie)).body.logo!;
    const text = await (await app.request("/api/brand-settings", { cookie: bob.cookie })).text();
    expect(text).not.toContain(aliceLogo.id);
  });

  test("a logo file needs a valid signature: no bare, tampered or re-pointed links", async () => {
    const aliceLogo = (await uploadLogo(alice.cookie)).body.logo!;
    const bobLogo = (await uploadLogo(bob.cookie)).body.logo!;
    expect((await app.request(`/api/files/logo/${aliceLogo.id}`, { cookie: bob.cookie })).status).toBe(403);
    expect((await app.request(aliceLogo.url.replace(/sig=[^&]{4}/, "sig=AAAA"))).status).toBe(403);
    // Bob's valid signature must not open Alice's file.
    expect((await app.request(bobLogo.url.replace(bobLogo.id, aliceLogo.id))).status).toBe(403);
    // A signature for another kind of file must not open a logo.
    expect((await app.request(aliceLogo.url.replace("/files/logo/", "/files/source/"))).status).toBe(403);
  });

  test("a member cannot upload or restore a logo", async () => {
    const aliceLogo = (await uploadLogo(alice.cookie)).body.logo!;
    const member = await signUpMember(app, alice);
    expect((await uploadLogo(member.cookie)).status).toBe(403);
    expect((await app.request(`/api/brand-settings/logos/${aliceLogo.id}/restore`, { method: "POST", cookie: member.cookie })).status).toBe(403);
    expect(app.db.raw.query("SELECT COUNT(*) AS n FROM brand_logos").get()).toEqual({ n: 1 });
  });

  test("a member can see the logo", async () => {
    const aliceLogo = (await uploadLogo(alice.cookie)).body.logo!;
    const member = await signUpMember(app, alice);
    const body = (await (await app.request("/api/brand-settings", { cookie: member.cookie })).json()) as { logo: { id: string; url: string } };
    expect(body.logo.id).toBe(aliceLogo.id);
    expect((await app.request(body.logo.url)).status).toBe(200);
  });
});

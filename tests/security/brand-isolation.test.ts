import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, signUp, signUpMember, type TestApp } from "../support/app";

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

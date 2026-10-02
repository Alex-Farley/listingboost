import { beforeEach, describe, expect, test } from "bun:test";
import type { SqlDatabase } from "@listingboost/database";
import { createTestApp, signUp, signUpMember, type TestApp } from "../support/app";

let app: TestApp;
let owner: Awaited<ReturnType<typeof signUp>>;

beforeEach(async () => {
  app = createTestApp();
  owner = await signUp(app, { agencyName: "Orchard Estates" });
});

type SettingsBody = {
  canEdit: boolean;
  settings: Record<string, unknown> & { preferredTemplates: Record<string, string> };
  warnings: Record<string, string>;
};
type ErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };

const read = async (cookie = owner.cookie) => {
  const response = await app.request("/api/brand-settings", { cookie });
  return { status: response.status, body: (await response.json()) as SettingsBody };
};
const save = (body: unknown, cookie = owner.cookie, target: TestApp = app) =>
  target.request("/api/brand-settings", { method: "PUT", cookie, body: JSON.stringify(body) });

const full = {
  agencyName: "Orchard & Co",
  contactPhone: "01582 760000",
  contactEmail: "hello@orchard.test",
  website: "https://orchard.test",
  officeAddress: "1 High Street\nHarpenden",
  primaryColour: "#1d2433",
  secondaryColour: "#f6f1e8",
  headingFont: null,
  bodyFont: null,
  toneOfVoice: "Warm and plain-spoken",
  preferredTemplates: { "social:square": "social-square" },
};

describe("AT-22 reading brand settings", () => {
  test("a new organisation has only its agency name; every other value is null, not defaulted (AC6)", async () => {
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body.canEdit).toBe(true);
    expect(body.settings).toEqual({
      agencyName: "Orchard Estates",
      contactPhone: null,
      contactEmail: null,
      website: null,
      officeAddress: null,
      primaryColour: null,
      secondaryColour: null,
      headingFont: null,
      bodyFont: null,
      toneOfVoice: null,
      preferredTemplates: {},
    });
    expect(body.warnings).toEqual({});
  });

  test("requires a session", async () => {
    expect((await app.request("/api/brand-settings")).status).toBe(401);
    expect((await app.request("/api/brand-settings", { method: "PUT", body: JSON.stringify(full) })).status).toBe(401);
  });

  test("returns only the signed-in organisation's values (AC1)", async () => {
    const other = await signUp(app, { agencyName: "Birch Lettings" });
    await save(full);
    await save({ ...full, agencyName: "Birch", contactPhone: "020 7946 0000", toneOfVoice: "Brisk" }, other.cookie);
    const mine = await read();
    expect(mine.body.settings.agencyName).toBe("Orchard & Co");
    expect(JSON.stringify(mine.body)).not.toContain("Birch");
    expect(JSON.stringify(mine.body)).not.toContain("020 7946 0000");
    const theirs = await read(other.cookie);
    expect(theirs.body.settings.agencyName).toBe("Birch");
    expect(JSON.stringify(theirs.body)).not.toContain("Orchard");
  });
});

describe("AT-22 saving brand settings", () => {
  test("an owner's valid values are saved and reload unchanged (AC5)", async () => {
    const response = await save(full);
    expect(response.status).toBe(200);
    expect(((await response.json()) as SettingsBody).settings).toEqual(full);
    expect((await read()).body.settings).toEqual(full);
  });

  test("clearing a value stores it as unset", async () => {
    await save(full);
    await save({ ...full, contactPhone: "", toneOfVoice: null, preferredTemplates: {} });
    const { settings } = (await read()).body;
    expect(settings.contactPhone).toBeNull();
    expect(settings.toneOfVoice).toBeNull();
    expect(settings.preferredTemplates).toEqual({});
  });

  test("a save is audited by action and actor, without the values", async () => {
    await save(full);
    const rows = app.db.raw.query("SELECT actor_user_id, metadata_json FROM audit_events WHERE action = 'brand_settings.updated'").all() as Array<{
      actor_user_id: string;
      metadata_json: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_user_id).toBe(owner.user.id);
    expect(rows[0]!.metadata_json).not.toContain("01582");
    expect(rows[0]!.metadata_json).not.toContain("Warm");
    expect(rows[0]!.metadata_json).not.toContain("orchard");
  });

  test("an invalid save names each field with a fix and stores nothing (AC7)", async () => {
    await save(full);
    const response = await save({ ...full, agencyName: "Changed", contactEmail: "nope", primaryColour: "blue", toneOfVoice: "x".repeat(201) });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("validation_error");
    expect(Object.keys(body.error.fields ?? {}).sort()).toEqual(["contactEmail", "primaryColour", "toneOfVoice"]);
    expect(body.error.fields!.primaryColour).toMatch(/#RRGGBB/);
    expect((await read()).body.settings).toEqual(full);
  });

  test("a body that is not JSON is a validation error, not a crash", async () => {
    const response = await app.request("/api/brand-settings", { method: "PUT", cookie: owner.cookie, body: "{nope", headers: { "Content-Type": "application/json" } });
    expect(response.status).toBe(400);
  });

  test("a font the organisation does not have is a field error (AC7)", async () => {
    const response = await save({ ...full, bodyFont: "custom:7b0c2f7e-58a1-4a53-9f0e-2f1f6f6f0a11" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.fields).toEqual({ bodyFont: "Choose a font from the list." });
  });

  test("a template that does not match the slot is a field error and stores nothing (AC30)", async () => {
    await save(full);
    for (const preferredTemplates of [{ "social:square": "story" }, { "story:primary": "social-portrait" }, { "social:square": "enhanced-photo" }, { "social:portrait": "no-such-template" }]) {
      const response = await save({ ...full, preferredTemplates });
      expect(response.status).toBe(400);
      const fields = ((await response.json()) as ErrorBody).error.fields ?? {};
      expect(Object.keys(fields)).toEqual([`preferredTemplates.${Object.keys(preferredTemplates)[0]}`]);
      expect(Object.values(fields)[0]).toMatch(/Choose a template/);
    }
    expect((await read()).body.settings.preferredTemplates).toEqual({ "social:square": "social-square" });
  });

  test("when the database write fails the error is recoverable and nothing is stored (AC8)", async () => {
    await save(full);
    const failing: SqlDatabase = {
      prepare: (sql) => {
        if (/brand_settings/.test(sql) && /^\s*(INSERT|UPDATE)/i.test(sql)) throw new Error("D1 unavailable");
        return app.db.prepare(sql);
      },
      batch: (statements) => app.db.batch(statements),
    };
    const broken = createTestApp({ db: failing });
    // Same database, so the owner's session is valid in the failing app.
    const response = await save({ ...full, agencyName: "Changed" }, owner.cookie, broken);
    expect(response.status).toBe(500);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.message).toBeString();
    expect(body.error.message).not.toContain("D1");
    expect((await read()).body.settings.agencyName).toBe("Orchard & Co");
  });

  test("poor colour contrast is saved and returned with a warning; good contrast has none (AC37, AC38)", async () => {
    const pale = await save({ ...full, primaryColour: "#f6f1e8" });
    expect(pale.status).toBe(200);
    const body = (await pale.json()) as SettingsBody;
    expect(body.settings.primaryColour).toBe("#f6f1e8");
    expect(body.warnings.primaryColour).toMatch(/hard to read/);
    expect((await read()).body.warnings.primaryColour).toMatch(/hard to read/);
    const dark = (await (await save(full)).json()) as SettingsBody;
    expect(dark.warnings).toEqual({});
  });
});

describe("AT-22 members", () => {
  test("a member reads the organisation's settings and is told they cannot edit (AC3)", async () => {
    await save(full);
    const member = await signUpMember(app, owner);
    const { status, body } = await read(member.cookie);
    expect(status).toBe(200);
    expect(body.canEdit).toBe(false);
    expect(body.settings).toEqual(full);
  });
});

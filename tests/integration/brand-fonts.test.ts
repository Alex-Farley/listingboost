import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, signUp, type TestApp } from "../support/app";
import { asVariableFont, fontFixtures } from "../support/fixtures";

let app: TestApp;
let owner: Awaited<ReturnType<typeof signUp>>;

beforeEach(async () => {
  app = createTestApp();
  owner = await signUp(app, { agencyName: "Orchard Estates" });
});

type Font = { ref: string; id: string; label: string; originalFormat: string; createdAt: string };
type Body = { fonts: { custom: Font[] }; settings: { headingFont: string | null; bodyFont: string | null } };
type ErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };

function form(bytes: Uint8Array<ArrayBuffer>, filename: string, extra: Record<string, string> = { rightsConfirmed: "true" }): FormData {
  const data = new FormData();
  data.append("file", new File([bytes], filename, { type: "application/octet-stream" }));
  for (const [key, value] of Object.entries(extra)) data.append(key, value);
  return data;
}
const upload = (bytes: Uint8Array<ArrayBuffer>, filename: string, extra?: Record<string, string>, cookie = owner.cookie) =>
  app.request("/api/brand-settings/fonts", { method: "POST", cookie, body: form(bytes, filename, extra) });
const read = async (cookie = owner.cookie) => (await (await app.request("/api/brand-settings", { cookie })).json()) as Body;
const save = (settings: Record<string, unknown>) =>
  app.request("/api/brand-settings", { method: "PUT", cookie: owner.cookie, body: JSON.stringify({ preferredTemplates: {}, ...settings }) });
const fontRows = () =>
  app.db.raw.query("SELECT id, object_key, format, original_format, rights_confirmed_by, rights_confirmed_at, removed_at, label FROM brand_fonts ORDER BY created_at, rowid").all() as Array<{
    id: string;
    object_key: string;
    format: string;
    original_format: string;
    rights_confirmed_by: string;
    rights_confirmed_at: string;
    removed_at: string | null;
    label: string;
  }>;
const storedBytes = async (key: string) => new Uint8Array(await new Response((await app.store.get(key))!.body).arrayBuffer());

describe("AT-22 custom font upload", () => {
  test("a new organisation has no custom fonts", async () => {
    expect((await read()).fonts.custom).toEqual([]);
  });

  for (const [name, bytes, filename, storedFormat] of [
    ["TTF", fontFixtures.ttf, "Inter.ttf", "ttf"],
    ["OTF", fontFixtures.otf, "SourceSans.otf", "otf"],
    ["WOFF", fontFixtures.woff, "Inter.woff", "woff"],
  ] as const) {
    test(`a ${name} font is stored as uploaded, listed, and the rights confirmation is recorded (AC14)`, async () => {
      const response = await upload(bytes(), filename);
      expect(response.status).toBe(201);
      const body = (await response.json()) as Body;
      expect(body.fonts.custom).toHaveLength(1);
      const font = body.fonts.custom[0]!;
      expect(font.ref).toBe(`custom:${font.id}`);
      expect(font.label).toBe(filename.replace(/\.\w+$/, ""));

      const [row] = fontRows();
      expect(row!.format).toBe(storedFormat);
      expect(row!.rights_confirmed_by).toBe(owner.user.id);
      expect(Number.isNaN(Date.parse(row!.rights_confirmed_at))).toBe(false);
      expect(row!.object_key).toBe(`org/${owner.organisation.id}/font/${row!.id}`);
      expect(await storedBytes(row!.object_key)).toEqual(bytes());
    });
  }

  test("a WOFF2 font is stored only in its converted TTF form (AC14, AC14a)", async () => {
    const response = await upload(fontFixtures.woff2(), "Inter.woff2");
    expect(response.status).toBe(201);
    const [row] = fontRows();
    expect(row!.original_format).toBe("woff2");
    expect(row!.format).toBe("ttf");
    const stored = await storedBytes(row!.object_key);
    expect([...stored.subarray(0, 4)]).toEqual([0x00, 0x01, 0x00, 0x00]);
    expect([...app.store.objects.keys()]).toEqual([row!.object_key]);
  });

  test("an OpenType WOFF2 is stored as OTF", async () => {
    expect((await upload(fontFixtures.otfWoff2(), "SourceSans.woff2")).status).toBe(201);
    expect(fontRows()[0]!.format).toBe("otf");
  });

  test("an uploaded font can be chosen for the heading or the body (AC14, AC17)", async () => {
    const font = ((await (await upload(fontFixtures.ttf(), "Inter.ttf")).json()) as Body).fonts.custom[0]!;
    expect((await save({ headingFont: font.ref, bodyFont: font.ref })).status).toBe(200);
    const { settings } = await read();
    expect(settings.headingFont).toBe(font.ref);
    expect(settings.bodyFont).toBe(font.ref);
  });

  test("a label can be given, and is trimmed and bounded", async () => {
    await upload(fontFixtures.ttf(), "Inter.ttf", { rightsConfirmed: "true", label: `  ${"Brand Sans ".repeat(10)}  ` });
    expect(fontRows()[0]!.label.length).toBeLessThanOrEqual(60);
    expect(fontRows()[0]!.label.startsWith("Brand Sans")).toBe(true);
  });

  test("without the rights confirmation the upload is refused and nothing is stored (AC15)", async () => {
    const unconfirmed: Array<Record<string, string>> = [{}, { rightsConfirmed: "false" }, { rightsConfirmed: "" }, { rightsConfirmed: "yes" }];
    for (const extra of unconfirmed) {
      const response = await upload(fontFixtures.ttf(), "Inter.ttf", extra);
      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.code).toBe("rights_not_confirmed");
      expect(body.error.fields?.rightsConfirmed).toMatch(/right to use/);
    }
    expect(fontRows()).toEqual([]);
    expect([...app.store.objects.keys()]).toEqual([]);
  });

  test("a rejected font says why and nothing is stored (AC16, AC14b, AC14c)", async () => {
    const tooBig = new Uint8Array(2 * 1024 * 1024 + 1);
    tooBig.set(fontFixtures.ttf().subarray(0, 4096));
    const corruptWoff2 = fontFixtures.woff2();
    for (let i = 100; i < corruptWoff2.length; i += 97) corruptWoff2[i] = corruptWoff2[i]! ^ 0xff;
    const oversizedWoff2 = fontFixtures.woff2();
    new DataView(oversizedWoff2.buffer).setUint32(8, 8 * 1024 * 1024 + 1);
    // A valid container whose glyph data is garbage: only drawing with it reveals the problem.
    const unrenderable = fontFixtures.ttf();
    unrenderable.fill(0xff, 12 + 16 * 20, unrenderable.length);

    const cases: Array<[Uint8Array<ArrayBuffer>, string, RegExp]> = [
      [tooBig, "big.ttf", /2 MB/],
      [new Uint8Array(new TextEncoder().encode("%PDF-1.7 not a font, padded out").buffer as ArrayBuffer), "font.ttf", /WOFF, WOFF2, TTF or OTF/],
      [fontFixtures.ttf(), "font.eot", /WOFF, WOFF2, TTF or OTF/],
      [fontFixtures.woff(), "font.ttf", /extension/],
      [asVariableFont(fontFixtures.ttf()), "variable.ttf", /Variable fonts are not supported.*static/],
      [asVariableFont(fontFixtures.woff()), "variable.woff", /Variable fonts are not supported/],
      [corruptWoff2, "broken.woff2", /damaged/],
      [oversizedWoff2, "huge.woff2", /8 MB/],
      [unrenderable, "garbage.ttf", /can't be used|damaged/],
    ];
    for (const [bytes, name, reason] of cases) {
      const response = await upload(bytes, name);
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.fields?.file).toMatch(reason);
    }
    expect(fontRows()).toEqual([]);
    expect([...app.store.objects.keys()]).toEqual([]);
  });

  test("a good font still uploads after rejected ones", async () => {
    await upload(fontFixtures.woff2().slice(0, 4000), "broken.woff2");
    expect((await upload(fontFixtures.woff2(), "Inter.woff2")).status).toBe(201);
  });

  test("font files are never offered for download", async () => {
    const font = ((await (await upload(fontFixtures.ttf(), "Inter.ttf")).json()) as Body).fonts.custom[0]!;
    expect(JSON.stringify(await read())).not.toContain("/api/files/");
    expect((await app.request(`/api/files/font/${font.id}`, { cookie: owner.cookie })).status).toBe(404);
  });

  test("an upload is audited without the file", async () => {
    await upload(fontFixtures.ttf(), "Inter.ttf");
    const rows = app.db.raw.query("SELECT action, actor_user_id FROM audit_events WHERE action LIKE 'brand_font.%'").all();
    expect(rows).toEqual([{ action: "brand_font.uploaded", actor_user_id: owner.user.id }]);
  });
});

describe("AT-22 removing a custom font", () => {
  test("a removed font leaves the list, keeps its file, and is no longer selectable (AC18a)", async () => {
    const font = ((await (await upload(fontFixtures.ttf(), "Inter.ttf")).json()) as Body).fonts.custom[0]!;
    await save({ headingFont: font.ref });
    const key = fontRows()[0]!.object_key;

    const response = await app.request(`/api/brand-settings/fonts/${font.id}`, { method: "DELETE", cookie: owner.cookie });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Body;
    expect(body.fonts.custom).toEqual([]);
    // The live profile cannot keep pointing at a font that can no longer be chosen.
    expect(body.settings.headingFont).toBeNull();
    expect(fontRows()[0]!.removed_at).not.toBeNull();
    expect(app.store.objects.has(key)).toBe(true);
    expect((await save({ bodyFont: font.ref })).status).toBe(400);
  });

  test("removing an unknown or already removed font is not found", async () => {
    const font = ((await (await upload(fontFixtures.ttf(), "Inter.ttf")).json()) as Body).fonts.custom[0]!;
    expect((await app.request(`/api/brand-settings/fonts/${crypto.randomUUID()}`, { method: "DELETE", cookie: owner.cookie })).status).toBe(404);
    expect((await app.request(`/api/brand-settings/fonts/${font.id}`, { method: "DELETE", cookie: owner.cookie })).status).toBe(200);
    expect((await app.request(`/api/brand-settings/fonts/${font.id}`, { method: "DELETE", cookie: owner.cookie })).status).toBe(404);
  });

  test("an organisation can have ten selectable fonts; the eleventh is refused until one is removed (AC18b)", async () => {
    for (let i = 0; i < 10; i++) expect((await upload(fontFixtures.woff(), `Font${i}.woff`)).status).toBe(201);
    const refused = await upload(fontFixtures.woff(), "Font10.woff");
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as ErrorBody;
    expect(body.error.code).toBe("font_limit");
    expect(body.error.message).toMatch(/10 fonts.*[Rr]emove/);
    expect(fontRows()).toHaveLength(10);

    const first = (await read()).fonts.custom[0]!;
    await app.request(`/api/brand-settings/fonts/${first.id}`, { method: "DELETE", cookie: owner.cookie });
    expect((await upload(fontFixtures.woff(), "Font10.woff")).status).toBe(201);
    expect((await read()).fonts.custom).toHaveLength(10);
    expect(fontRows()).toHaveLength(11);
  });
});

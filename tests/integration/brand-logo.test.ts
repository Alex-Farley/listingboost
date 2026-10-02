import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, signUp, type TestApp } from "../support/app";
import { fixture, solidPng } from "../support/fixtures";

let app: TestApp;
let owner: Awaited<ReturnType<typeof signUp>>;

beforeEach(async () => {
  app = createTestApp();
  owner = await signUp(app, { agencyName: "Orchard Estates" });
});

type Logo = { id: string; url: string; width: number; height: number; contentType: string; originalFormat: string; createdAt: string };
type Body = { logo: Logo | null; previousLogos: Logo[] };
type ErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };

const SAFE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80"><rect width="200" height="80" rx="8" fill="#1d2433"/><circle cx="40" cy="40" r="20" fill="#fff"/></svg>`;
const UNSAFE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>`;

function form(bytes: Uint8Array<ArrayBuffer> | string, filename: string, type: string): FormData {
  const data = new FormData();
  data.append("file", new File([bytes], filename, { type }));
  return data;
}
const upload = (bytes: Uint8Array<ArrayBuffer> | string, filename: string, type: string, cookie = owner.cookie) =>
  app.request("/api/brand-settings/logo", { method: "POST", cookie, body: form(bytes, filename, type) });
const read = async (cookie = owner.cookie) => (await (await app.request("/api/brand-settings", { cookie })).json()) as Body;
const logoRows = () => app.db.raw.query("SELECT id, object_key, content_type, original_format FROM brand_logos ORDER BY created_at, rowid").all() as Array<{
  id: string;
  object_key: string;
  content_type: string;
  original_format: string;
}>;

describe("AT-22 logo upload", () => {
  test("a new organisation has no logo and no previous logos", async () => {
    const body = await read();
    expect(body.logo).toBeNull();
    expect(body.previousLogos).toEqual([]);
  });

  test("a valid PNG becomes the current logo with a preview that can be fetched (AC9)", async () => {
    const png = solidPng(320, 120);
    const response = await upload(png, "logo.png", "image/png");
    expect(response.status).toBe(201);
    const body = (await response.json()) as Body;
    expect(body.logo).toMatchObject({ width: 320, height: 120, contentType: "image/png", originalFormat: "png" });
    expect(body.previousLogos).toEqual([]);
    expect((await read()).logo!.id).toBe(body.logo!.id);

    const preview = await app.request(body.logo!.url);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe("image/png");
    expect(preview.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(png);
  });

  test("JPEG and WebP logos are accepted (AC9)", async () => {
    expect((await upload(fixture("photo-800x600.jpg"), "logo.jpg", "image/jpeg")).status).toBe(201);
    expect((await upload(fixture("photo-800x600.webp"), "logo.webp", "image/webp")).status).toBe(201);
    expect((await read()).logo).toMatchObject({ contentType: "image/webp", originalFormat: "webp" });
  });

  test("the file is stored under the organisation's private prefix", async () => {
    await upload(solidPng(64, 64), "logo.png", "image/png");
    const [row] = logoRows();
    expect(row!.object_key).toBe(`org/${owner.organisation.id}/logo/${row!.id}`);
    expect(app.store.objects.has(row!.object_key)).toBe(true);
  });

  test("a rejected file says why and leaves the current logo unchanged (AC10)", async () => {
    await upload(solidPng(64, 64), "logo.png", "image/png");
    const current = (await read()).logo!.id;
    const png = solidPng(64, 64);
    const tooBig = new Uint8Array(2 * 1024 * 1024 + 1);
    tooBig.set(png);
    const cases: Array<[Uint8Array<ArrayBuffer>, string, string, RegExp]> = [
      [tooBig, "logo.png", "image/png", /2 MB/],
      [fixture("photo.gif"), "logo.gif", "image/gif", /PNG, JPEG, WebP or SVG/],
      [png, "logo.jpg", "image/jpeg", /match/],
      [png.slice(0, png.length - 20), "logo.png", "image/png", /damaged/],
    ];
    for (const [bytes, name, type, reason] of cases) {
      const response = await upload(bytes, name, type);
      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.fields?.file).toMatch(reason);
    }
    expect((await read()).logo!.id).toBe(current);
    expect(logoRows()).toHaveLength(1);
    expect([...app.store.objects.keys()].filter((k) => k.includes("/logo/"))).toHaveLength(1);
  });

  test("an upload with no file is refused", async () => {
    const response = await app.request("/api/brand-settings/logo", { method: "POST", cookie: owner.cookie, body: new FormData() });
    expect(response.status).toBe(400);
  });
});

describe("AT-22 SVG logos", () => {
  test("an unsafe SVG is rejected with the reason and nothing is stored (AC11)", async () => {
    const response = await upload(UNSAFE_SVG, "logo.svg", "image/svg+xml");
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("unsafe_svg");
    expect(body.error.fields?.file).toMatch(/script/);
    expect(logoRows()).toEqual([]);
    expect([...app.store.objects.keys()]).toEqual([]);
    expect((await read()).logo).toBeNull();
  });

  test("an SVG disguised with a PNG name or type is not treated as a PNG", async () => {
    expect((await upload(UNSAFE_SVG, "logo.png", "image/png")).status).toBe(400);
    expect((await upload(UNSAFE_SVG, "logo.svg", "image/png")).status).toBe(400);
    expect(logoRows()).toEqual([]);
  });

  test("a safe SVG is stored as a PNG only, and nothing ever serves SVG (AC11a)", async () => {
    const response = await upload(SAFE_SVG, "logo.svg", "image/svg+xml");
    expect(response.status).toBe(201);
    const body = (await response.json()) as Body;
    // 200x80 scaled so its longer side is 2048 px.
    expect(body.logo).toMatchObject({ contentType: "image/png", originalFormat: "svg", width: 2048, height: 819 });

    const [row] = logoRows();
    expect(row!.content_type).toBe("image/png");
    const stored = [...app.store.objects.keys()];
    expect(stored).toEqual([row!.object_key]);
    const object = (await app.store.get(row!.object_key))!;
    expect(object.contentType).toBe("image/png");
    const storedBytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    expect([...storedBytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(new TextDecoder().decode(storedBytes)).not.toContain("<svg");

    const preview = await app.request(body.logo!.url);
    expect(preview.headers.get("Content-Type")).toBe("image/png");
    expect(JSON.stringify(body)).not.toContain("svg+xml");
  });

  test("an SVG with live text is refused, because it would be drawn in the wrong font", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text x="0" y="20">Orchard</text></svg>`;
    const response = await upload(svg, "logo.svg", "image/svg+xml");
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.fields?.file).toMatch(/outlines/);
  });
});

describe("AT-22 logo history and restore", () => {
  test("a second upload becomes current and the first is kept as a previous logo (AC12)", async () => {
    const first = ((await (await upload(solidPng(64, 64), "a.png", "image/png")).json()) as Body).logo!;
    app.clock.offsetMs += 1000;
    const second = ((await (await upload(solidPng(96, 96), "b.png", "image/png")).json()) as Body).logo!;
    const body = await read();
    expect(body.logo!.id).toBe(second.id);
    expect(body.previousLogos.map((l) => l.id)).toEqual([first.id]);
    expect([...app.store.objects.keys()].filter((k) => k.includes("/logo/"))).toHaveLength(2);
    expect((await app.request(body.previousLogos[0]!.url)).status).toBe(200);
  });

  test("restoring swaps current and previous and deletes nothing (AC13)", async () => {
    const first = ((await (await upload(solidPng(64, 64), "a.png", "image/png")).json()) as Body).logo!;
    app.clock.offsetMs += 1000;
    const second = ((await (await upload(solidPng(96, 96), "b.png", "image/png")).json()) as Body).logo!;
    const keysBefore = [...app.store.objects.keys()].sort();

    const response = await app.request(`/api/brand-settings/logos/${first.id}/restore`, { method: "POST", cookie: owner.cookie });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Body;
    expect(body.logo!.id).toBe(first.id);
    expect(body.previousLogos.map((l) => l.id)).toEqual([second.id]);
    expect([...app.store.objects.keys()].sort()).toEqual(keysBefore);
    expect(logoRows()).toHaveLength(2);
  });

  test("restoring an unknown logo is not found", async () => {
    const response = await app.request(`/api/brand-settings/logos/${crypto.randomUUID()}/restore`, { method: "POST", cookie: owner.cookie });
    expect(response.status).toBe(404);
  });

  test("uploads and restores are audited without file contents", async () => {
    const first = ((await (await upload(solidPng(64, 64), "a.png", "image/png")).json()) as Body).logo!;
    await upload(solidPng(96, 96), "b.png", "image/png");
    await app.request(`/api/brand-settings/logos/${first.id}/restore`, { method: "POST", cookie: owner.cookie });
    const actions = (app.db.raw.query("SELECT action FROM audit_events WHERE action LIKE 'brand_logo.%' ORDER BY rowid").all() as Array<{ action: string }>).map((r) => r.action);
    expect(actions).toEqual(["brand_logo.uploaded", "brand_logo.uploaded", "brand_logo.restored"]);
  });
});

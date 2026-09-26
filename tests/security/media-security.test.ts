import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, photoForm, signUp, type TestApp } from "../support/app";
import { fixture } from "../support/fixtures";

let app: TestApp;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
let alicePropertyId: string;
let aliceMedia: { id: string; url: string };

const rowCount = () => (app.db.raw.query("SELECT COUNT(*) AS n FROM property_media").get() as { n: number }).n;

beforeEach(async () => {
  app = createTestApp();
  alice = await signUp(app);
  bob = await signUp(app);
  alicePropertyId = await createProperty(app, alice.cookie);
  const response = await app.request(`/api/properties/${alicePropertyId}/media`, {
    method: "POST",
    cookie: alice.cookie,
    body: photoForm(fixture("photo-800x600.jpg"), "a.jpg", "image/jpeg"),
  });
  aliceMedia = (await response.json()) as { id: string; url: string };
});

describe("AT-04 invalid uploads are rejected before storage", () => {
  // Multipart parsers may re-derive a part's type from its filename (Bun does), so a renamed
  // file can surface as either mismatch. Both must reject; the unit tests pin each code.
  const bad: Array<[string, () => FormData, string | string[]]> = [
    ["gif", () => photoForm(fixture("photo.gif"), "a.gif", "image/gif"), "unsupported_format"],
    ["svg", () => photoForm(fixture("drawing.svg"), "a.svg", "image/svg+xml"), "unsupported_format"],
    ["png renamed .jpg", () => photoForm(fixture("photo-800x600.png"), "a.jpg", "image/png"), ["extension_mismatch", "type_mismatch"]],
    ["truncated", () => photoForm(fixture("photo-800x600.jpg").slice(0, 3000), "a.jpg", "image/jpeg"), "corrupt_image"],
    ["too small", () => photoForm(fixture("too-small-300x200.jpg"), "a.jpg", "image/jpeg"), "image_too_small"],
  ];
  for (const [name, form, code] of bad) {
    test(name, async () => {
      const objectsBefore = app.store.objects.size;
      const rowsBefore = rowCount();
      const response = await app.request(`/api/properties/${alicePropertyId}/media`, { method: "POST", cookie: alice.cookie, body: form() });
      expect(response.status).toBe(400);
      const actual = ((await response.json()) as { error: { code: string } }).error.code;
      expect(Array.isArray(code) ? code : [code]).toContain(actual);
      expect(app.store.objects.size).toBe(objectsBefore);
      expect(rowCount()).toBe(rowsBefore);
    });
  }

  test("missing file field", async () => {
    const form = new FormData();
    form.append("other", "x");
    const response = await app.request(`/api/properties/${alicePropertyId}/media`, { method: "POST", cookie: alice.cookie, body: form });
    expect(response.status).toBe(400);
  });

  test("non-multipart body", async () => {
    const response = await app.request(`/api/properties/${alicePropertyId}/media`, { method: "POST", cookie: alice.cookie, body: JSON.stringify({}) });
    expect(response.status).toBe(415);
  });

  test("declared body larger than the limit is refused before reading", async () => {
    const response = await app.request(`/api/properties/${alicePropertyId}/media`, {
      method: "POST",
      cookie: alice.cookie,
      headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": String(30 * 1024 * 1024) },
      body: "--x--",
    });
    expect(response.status).toBe(413);
  });
});

describe("AT-02/AT-12 media isolation", () => {
  test("cannot upload to another organisation's property", async () => {
    const before = app.store.objects.size;
    const response = await app.request(`/api/properties/${alicePropertyId}/media`, {
      method: "POST",
      cookie: bob.cookie,
      body: photoForm(fixture("photo-800x600.jpg"), "a.jpg", "image/jpeg"),
    });
    expect(response.status).toBe(404);
    expect(app.store.objects.size).toBe(before);
  });

  test("cannot list, reorder, set primary, replace or delete another organisation's media", async () => {
    const base = `/api/properties/${alicePropertyId}/media`;
    const attempts = [
      app.request(base, { cookie: bob.cookie }),
      app.request(`${base}/order`, { method: "PUT", cookie: bob.cookie, body: JSON.stringify({ mediaIds: [aliceMedia.id] }) }),
      app.request(`${base}/${aliceMedia.id}/primary`, { method: "POST", cookie: bob.cookie }),
      app.request(`${base}/${aliceMedia.id}`, { method: "PUT", cookie: bob.cookie, body: photoForm(fixture("photo-800x600.jpg"), "a.jpg", "image/jpeg") }),
      app.request(`${base}/${aliceMedia.id}`, { method: "DELETE", cookie: bob.cookie }),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(404);
    expect(rowCount()).toBe(1);
    expect(app.store.objects.size).toBe(1);
  });

  test("media id from another property of the same organisation is not accepted", async () => {
    const otherProperty = await createProperty(app, alice.cookie);
    const response = await app.request(`/api/properties/${otherProperty}/media/${aliceMedia.id}/url`, { cookie: alice.cookie });
    expect(response.status).toBe(404);
  });
});

describe("AT-19 signed media URLs", () => {
  const urlFor = (cookie?: string) => app.request(`/api/properties/${alicePropertyId}/media/${aliceMedia.id}/url`, cookie ? { cookie } : {});

  test("unauthenticated users cannot obtain a signed URL", async () => {
    expect((await urlFor()).status).toBe(401);
  });

  test("another organisation cannot obtain a signed URL", async () => {
    const response = await urlFor(bob.cookie);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("sig=");
  });

  test("tampered signature is refused", async () => {
    const url = new URL(aliceMedia.url, "https://x");
    url.searchParams.set("sig", url.searchParams.get("sig")!.replace(/^./, (c) => (c === "A" ? "B" : "A")));
    expect((await app.request(url.pathname + url.search)).status).toBe(403);
  });

  test("changing disposition or expiry invalidates the signature", async () => {
    const url = new URL(aliceMedia.url, "https://x");
    url.searchParams.set("disp", "attachment");
    expect((await app.request(url.pathname + url.search)).status).toBe(403);
    const url2 = new URL(aliceMedia.url, "https://x");
    url2.searchParams.set("exp", String(Number(url2.searchParams.get("exp")) + 3600));
    expect((await app.request(url2.pathname + url2.search)).status).toBe(403);
  });

  test("a signature cannot be moved to another media id", async () => {
    const other = await app.request(`/api/properties/${alicePropertyId}/media`, {
      method: "POST",
      cookie: alice.cookie,
      body: photoForm(fixture("photo-800x600.png"), "b.png", "image/png"),
    });
    const otherId = ((await other.json()) as { id: string }).id;
    expect((await app.request(aliceMedia.url.replace(aliceMedia.id, otherId))).status).toBe(403);
  });

  test("expired URLs are refused", async () => {
    app.clock.offsetMs = 16 * 60 * 1000;
    expect((await app.request(aliceMedia.url)).status).toBe(403);
  });

  test("URLs stop working once the media is deleted", async () => {
    await app.request(`/api/properties/${alicePropertyId}/media/${aliceMedia.id}`, { method: "DELETE", cookie: alice.cookie });
    expect((await app.request(aliceMedia.url)).status).toBe(404);
  });

  test("malformed download parameters are refused", async () => {
    expect((await app.request(`/api/files/source/${aliceMedia.id}`)).status).toBe(403);
    expect((await app.request(`/api/files/source/${aliceMedia.id}?exp=abc&disp=inline&sig=x`)).status).toBe(403);
    expect((await app.request(`/api/files/other/${aliceMedia.id}?exp=1&disp=inline&sig=x`)).status).toBe(404);
  });
});

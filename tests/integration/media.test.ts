import { beforeEach, describe, expect, test } from "bun:test";
import { createProperty, createTestApp, photoForm, signUp, type TestApp } from "../support/app";
import { fixture } from "../support/fixtures";

type Media = {
  id: string;
  contentType: string;
  width: number;
  height: number;
  byteSize: number;
  position: number;
  isPrimary: boolean;
  url: string;
  filename: string;
};

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;

beforeEach(async () => {
  app = createTestApp();
  account = await signUp(app);
  propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way, Harpenden" });
});

async function upload(file = "photo-800x600.jpg", name = "lounge.jpg", type = "image/jpeg") {
  return app.request(`/api/properties/${propertyId}/media`, { method: "POST", cookie: account.cookie, body: photoForm(fixture(file), name, type) });
}

async function uploadOk(file?: string, name?: string, type?: string): Promise<Media> {
  const response = await upload(file, name, type);
  expect(response.status).toBe(201);
  return (await response.json()) as Media;
}

async function list(): Promise<Media[]> {
  return ((await (await app.request(`/api/properties/${propertyId}/media`, { cookie: account.cookie })).json()) as { items: Media[] }).items;
}

describe("AT-05 secure photo upload", () => {
  test("stores a validated photo under a server-generated key in the organisation prefix", async () => {
    const media = await uploadOk();
    expect(media).toMatchObject({ contentType: "image/jpeg", width: 800, height: 600, position: 0, isPrimary: true });
    expect(media.byteSize).toBe(fixture("photo-800x600.jpg").length);

    const row = app.db.raw.query("SELECT object_key, sha256, organisation_id FROM property_media WHERE id = ?").get(media.id) as {
      object_key: string;
      sha256: string;
      organisation_id: string;
    };
    expect(row.object_key).toBe(`org/${account.organisation.id}/source/${media.id}`);
    expect(row.object_key).not.toContain("lounge");
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(app.store.objects.get(row.object_key)?.bytes).toEqual(fixture("photo-800x600.jpg"));
  });

  test("first photo is primary; later photos are appended in order", async () => {
    const a = await uploadOk();
    const b = await uploadOk("photo-800x600.png", "kitchen.png", "image/png");
    const c = await uploadOk("photo-800x600.webp", "garden.webp", "image/webp");
    expect([a, b, c].map((m) => [m.position, m.isPrimary])).toEqual([
      [0, true],
      [1, false],
      [2, false],
    ]);
    expect((await list()).map((m) => m.id)).toEqual([a.id, b.id, c.id]);
  });

  test("reorder photos", async () => {
    const a = await uploadOk();
    const b = await uploadOk();
    const c = await uploadOk();
    const response = await app.request(`/api/properties/${propertyId}/media/order`, {
      method: "PUT",
      cookie: account.cookie,
      body: JSON.stringify({ mediaIds: [c.id, a.id, b.id] }),
    });
    expect(response.status).toBe(200);
    expect((await list()).map((m) => [m.id, m.position])).toEqual([
      [c.id, 0],
      [a.id, 1],
      [b.id, 2],
    ]);
  });

  test("reorder must list exactly the property's photos", async () => {
    const a = await uploadOk();
    const b = await uploadOk();
    for (const mediaIds of [[a.id], [a.id, a.id], [a.id, b.id, "someone-else"]]) {
      const response = await app.request(`/api/properties/${propertyId}/media/order`, {
        method: "PUT",
        cookie: account.cookie,
        body: JSON.stringify({ mediaIds }),
      });
      expect(response.status).toBe(400);
    }
  });

  test("choose a primary photo", async () => {
    const a = await uploadOk();
    const b = await uploadOk();
    expect((await app.request(`/api/properties/${propertyId}/media/${b.id}/primary`, { method: "POST", cookie: account.cookie })).status).toBe(200);
    expect((await list()).map((m) => [m.id, m.isPrimary])).toEqual([
      [a.id, false],
      [b.id, true],
    ]);
  });

  test("delete removes the object; the next photo becomes primary and positions close up", async () => {
    const a = await uploadOk();
    const b = await uploadOk();
    const c = await uploadOk();
    const key = `org/${account.organisation.id}/source/${a.id}`;
    expect((await app.request(`/api/properties/${propertyId}/media/${a.id}`, { method: "DELETE", cookie: account.cookie })).status).toBe(204);
    expect(app.store.objects.has(key)).toBe(false);
    expect((await list()).map((m) => [m.id, m.position, m.isPrimary])).toEqual([
      [b.id, 0, true],
      [c.id, 1, false],
    ]);
  });

  test("replace keeps the slot but swaps the image", async () => {
    const a = await uploadOk();
    const b = await uploadOk();
    const response = await app.request(`/api/properties/${propertyId}/media/${a.id}`, {
      method: "PUT",
      cookie: account.cookie,
      body: photoForm(fixture("photo-1080x1350.jpg"), "better.jpg", "image/jpeg"),
    });
    expect(response.status).toBe(200);
    const replaced = (await response.json()) as Media;
    expect(replaced.id).not.toBe(a.id);
    expect(replaced).toMatchObject({ position: 0, isPrimary: true, width: 1080, height: 1350 });
    expect(app.store.objects.has(`org/${account.organisation.id}/source/${a.id}`)).toBe(false);
    expect((await list()).map((m) => m.id)).toEqual([replaced.id, b.id]);
  });
});

describe("AT-11 download own media", () => {
  test("inline signed URL serves the original bytes safely", async () => {
    const media = await uploadOk();
    const response = await app.request(media.url);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(fixture("photo-800x600.jpg"));
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toBe(`inline; filename="${media.filename}"`);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
  });

  test("attachment URL uses a sensible filename", async () => {
    await uploadOk();
    const media = await uploadOk("photo-800x600.png", "IMG_0001.png", "image/png");
    const response = await app.request(`/api/properties/${propertyId}/media/${media.id}/url?disposition=attachment`, { cookie: account.cookie });
    expect(response.status).toBe(200);
    const { url, expiresAt } = (await response.json()) as { url: string; expiresAt: string };
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(4 * 60 * 1000);
    const download = await app.request(url);
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Disposition")).toBe('attachment; filename="12-orchard-way-harpenden-photo-2.png"');
  });
});

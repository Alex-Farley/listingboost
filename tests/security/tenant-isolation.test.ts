import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, signUp, type TestApp } from "../support/app";

let app: TestApp;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
let bobPropertyId: string;

const property = { addressLine1: "9 Secret Lane", postcode: "AL5 2AB", propertyType: "detached", bedrooms: 5 };

beforeEach(async () => {
  app = createTestApp();
  alice = await signUp(app, { agencyName: "Alice Estates" });
  bob = await signUp(app, { agencyName: "Bob Lettings" });
  const created = await app.request("/api/properties", { method: "POST", cookie: bob.cookie, body: JSON.stringify(property) });
  bobPropertyId = ((await created.json()) as { id: string }).id;
});

describe("AT-02 tenant isolation: properties", () => {
  test("cannot read another organisation's property (404, not 403)", async () => {
    const response = await app.request(`/api/properties/${bobPropertyId}`, { cookie: alice.cookie });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Secret Lane");
  });

  test("cannot update another organisation's property", async () => {
    const response = await app.request(`/api/properties/${bobPropertyId}`, {
      method: "PUT",
      cookie: alice.cookie,
      body: JSON.stringify({ ...property, bedrooms: 1 }),
    });
    expect(response.status).toBe(404);
    const row = app.db.raw.query("SELECT bedrooms FROM properties WHERE id = ?").get(bobPropertyId) as { bedrooms: number };
    expect(row.bedrooms).toBe(5);
  });

  test("cannot archive another organisation's property", async () => {
    expect((await app.request(`/api/properties/${bobPropertyId}/archive`, { method: "POST", cookie: alice.cookie })).status).toBe(404);
    const row = app.db.raw.query("SELECT archived_at FROM properties WHERE id = ?").get(bobPropertyId) as { archived_at: string | null };
    expect(row.archived_at).toBeNull();
  });

  test("lists and searches never include another organisation's properties", async () => {
    for (const path of ["/api/properties", "/api/properties?q=Secret", "/api/properties?propertyType=detached"]) {
      const body = (await (await app.request(path, { cookie: alice.cookie })).json()) as { items: unknown[] };
      expect(body.items).toEqual([]);
    }
  });

  test("organisation cannot be chosen by the client", async () => {
    const response = await app.request("/api/properties", {
      method: "POST",
      cookie: alice.cookie,
      body: JSON.stringify({ ...property, organisationId: bob.organisation.id }),
    });
    expect(response.status).toBe(201);
    const id = ((await response.json()) as { id: string }).id;
    const row = app.db.raw.query("SELECT organisation_id FROM properties WHERE id = ?").get(id) as { organisation_id: string };
    expect(row.organisation_id).toBe(alice.organisation.id);
  });
});

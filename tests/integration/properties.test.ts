import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, signUp, type TestApp } from "../support/app";

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;

beforeEach(async () => {
  app = createTestApp();
  account = await signUp(app);
});

const full = {
  title: "Three-bedroom family home",
  addressLine1: "12 Orchard Way",
  town: "Harpenden",
  county: "Hertfordshire",
  postcode: "al5 2ab",
  propertyType: "semi_detached",
  bedrooms: 3,
  bathrooms: 2,
  receptionRooms: 1,
  floorArea: { value: 1150, unit: "sq_ft" },
  price: { amount: 650000, qualifier: "guide_price" },
  tenure: "freehold",
  parking: "Driveway",
  garden: "Rear garden",
  keyFeatures: ["Open-plan kitchen"],
  description: "A bright family home.",
  sourceUrl: "https://www.rightmove.co.uk/properties/123",
  agent: { name: "Jane Agent", phone: "01582 000000", email: "jane@agency.test" },
};

type PropertyBody = Record<string, unknown> & { id: string; facts: Record<string, unknown>; provenance: Record<string, { source: string; verified: boolean }> };

async function create(body: unknown, cookie = account.cookie) {
  return app.request("/api/properties", { method: "POST", cookie, body: JSON.stringify(body) });
}

describe("AT-03 create property", () => {
  test("creates a property with all facts", async () => {
    const response = await create(full);
    expect(response.status).toBe(201);
    const property = (await response.json()) as PropertyBody;
    expect(property.id).toBeString();
    expect(property.facts.postcode).toBe("AL5 2AB");
    expect(property.facts.bedrooms).toBe(3);
    expect(property.facts.price).toEqual({ amount: 650000, qualifier: "guide_price" });
    expect(property.sourceUrl).toBe(full.sourceUrl);
    expect(property.agent).toEqual(full.agent);

    const fetched = await app.request(`/api/properties/${property.id}`, { cookie: account.cookie });
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as PropertyBody).facts).toEqual(property.facts);
  });

  test("manual entry records provenance for each supplied fact and leaves unknown facts null", async () => {
    const response = await create({ addressLine1: "1 High St", postcode: "SW1A 1AA", propertyType: "flat", bedrooms: 1 });
    const property = (await response.json()) as PropertyBody;
    expect(property.facts.bathrooms).toBeNull();
    expect(property.facts.tenure).toBeNull();
    expect(property.provenance.bedrooms).toEqual({ source: "manual", verified: true });
    expect(property.provenance.bathrooms).toBeUndefined();
  });

  test("invalid input returns field errors and persists nothing", async () => {
    const response = await create({ postcode: "nope", propertyType: "castle" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { fields: Record<string, string> } };
    expect(Object.keys(body.error.fields)).toEqual(expect.arrayContaining(["postcode", "propertyType"]));
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM properties").get() as { n: number }).n).toBe(0);
  });

  test("requires authentication", async () => {
    expect((await app.request("/api/properties", { method: "POST", body: JSON.stringify(full) })).status).toBe(401);
  });

  test("records an audit event", async () => {
    const property = (await (await create(full)).json()) as PropertyBody;
    const event = app.db.raw.query("SELECT action, subject_id FROM audit_events WHERE subject_type = 'property'").get() as { action: string; subject_id: string };
    expect(event).toEqual({ action: "property.created", subject_id: property.id });
  });
});

describe("edit property", () => {
  test("updates facts; clearing a fact sets it to null and removes its provenance", async () => {
    const property = (await (await create(full)).json()) as PropertyBody;
    const response = await app.request(`/api/properties/${property.id}`, {
      method: "PUT",
      cookie: account.cookie,
      body: JSON.stringify({ ...full, bedrooms: 4, tenure: null }),
    });
    expect(response.status).toBe(200);
    const updated = (await response.json()) as PropertyBody;
    expect(updated.facts.bedrooms).toBe(4);
    expect(updated.facts.tenure).toBeNull();
    expect(updated.provenance.tenure).toBeUndefined();
  });
});

describe("history: list, search, filter, paginate", () => {
  test("lists newest first with cursor pagination", async () => {
    for (let i = 0; i < 5; i++) await create({ ...full, title: `Home ${i}` });
    const first = (await (await app.request("/api/properties?limit=2", { cookie: account.cookie })).json()) as { items: PropertyBody[]; nextCursor: string | null };
    expect(first.items.map((p) => p.facts.title)).toEqual(["Home 4", "Home 3"]);
    expect(first.nextCursor).toBeString();
    const second = (await (await app.request(`/api/properties?limit=2&cursor=${first.nextCursor}`, { cookie: account.cookie })).json()) as {
      items: PropertyBody[];
      nextCursor: string | null;
    };
    expect(second.items.map((p) => p.facts.title)).toEqual(["Home 2", "Home 1"]);
    const third = (await (await app.request(`/api/properties?limit=2&cursor=${second.nextCursor}`, { cookie: account.cookie })).json()) as {
      items: PropertyBody[];
      nextCursor: string | null;
    };
    expect(third.items.map((p) => p.facts.title)).toEqual(["Home 0"]);
    expect(third.nextCursor).toBeNull();
  });

  test("search matches title, address, town and postcode", async () => {
    await create({ ...full, title: "Riverside cottage", town: "Henley", postcode: "RG9 1AA" });
    await create({ ...full, title: "Town flat", town: "Luton", postcode: "LU1 1AA" });
    const search = async (q: string) =>
      ((await (await app.request(`/api/properties?q=${encodeURIComponent(q)}`, { cookie: account.cookie })).json()) as { items: PropertyBody[] }).items.map(
        (p) => p.facts.title,
      );
    expect(await search("riverside")).toEqual(["Riverside cottage"]);
    expect(await search("luton")).toEqual(["Town flat"]);
    expect(await search("RG9")).toEqual(["Riverside cottage"]);
    expect(await search("%")).toEqual([]);
  });

  test("filters by property type", async () => {
    await create({ ...full, title: "Flat", propertyType: "flat" });
    await create({ ...full, title: "House", propertyType: "detached" });
    const body = (await (await app.request("/api/properties?propertyType=flat", { cookie: account.cookie })).json()) as { items: PropertyBody[] };
    expect(body.items.map((p) => p.facts.title)).toEqual(["Flat"]);
  });

  test("archived properties are hidden from the list but can be read", async () => {
    const property = (await (await create(full)).json()) as PropertyBody;
    expect((await app.request(`/api/properties/${property.id}/archive`, { method: "POST", cookie: account.cookie })).status).toBe(200);
    const list = (await (await app.request("/api/properties", { cookie: account.cookie })).json()) as { items: PropertyBody[] };
    expect(list.items).toHaveLength(0);
    expect((await app.request(`/api/properties/${property.id}`, { cookie: account.cookie })).status).toBe(200);
  });

  test("invalid list parameters are rejected", async () => {
    expect((await app.request("/api/properties?limit=500", { cookie: account.cookie })).status).toBe(400);
    expect((await app.request("/api/properties?cursor=garbage", { cookie: account.cookie })).status).toBe(400);
  });
});

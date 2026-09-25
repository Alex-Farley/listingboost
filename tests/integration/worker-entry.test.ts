import { describe, expect, test } from "bun:test";
import worker from "../../apps/web/server/index";
import { createTestDatabase } from "../support/sqlite-d1";

// Storage is never reached by these requests; the R2 adapter is exercised on wrangler dev.
const untouchedBucket = {
  async get() {
    throw new Error("not used");
  },
  async put() {
    throw new Error("not used");
  },
  async delete() {
    throw new Error("not used");
  },
};

const env = (overrides: Record<string, string> = {}) => ({
  DB: createTestDatabase(),
  MEDIA: untouchedBucket,
  APP_ORIGIN: "https://app.listingboost.test",
  MEDIA_SIGNING_SECRET: "x".repeat(32),
  ...overrides,
});

describe("worker entry", () => {
  test("serves the API with the configured bindings", async () => {
    const response = await worker.fetch(new Request("https://app.listingboost.test/api/session"), env());
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("fails closed when the media signing secret is missing or weak", async () => {
    for (const secret of ["", "short"]) {
      const response = await worker.fetch(new Request("https://app.listingboost.test/api/session"), env({ MEDIA_SIGNING_SECRET: secret }));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("MEDIA_SIGNING_SECRET");
    }
  });

  test("fails closed when a binding is missing", async () => {
    const response = await worker.fetch(new Request("https://app.listingboost.test/api/session"), { ...env(), MEDIA: undefined });
    expect(response.status).toBe(500);
  });

  test("fails closed when APP_ORIGIN is not an origin", async () => {
    const response = await worker.fetch(new Request("https://app.listingboost.test/api/session"), env({ APP_ORIGIN: "not a url" }));
    expect(response.status).toBe(500);
  });
});

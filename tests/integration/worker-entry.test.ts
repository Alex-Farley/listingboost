import { describe, expect, test } from "bun:test";
import worker, { presetFontsFrom } from "../../apps/web/server/index";
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

const sent: Array<{ body: unknown; options?: { delaySeconds?: number } }> = [];
const jobsQueue = {
  async send(body: unknown, options?: { delaySeconds?: number }) {
    sent.push({ body, options });
  },
};

const env = (overrides: Record<string, string> = {}) => ({
  DB: createTestDatabase(),
  MEDIA: untouchedBucket,
  JOBS: jobsQueue,
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

function message(body: unknown) {
  const outcome = { acked: false, retried: false };
  return {
    outcome,
    message: {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      attempts: 1,
      body,
      ack() {
        outcome.acked = true;
      },
      retry() {
        outcome.retried = true;
      },
    },
  };
}

describe("worker queue consumer and scheduled sweeper", () => {
  test("acks unknown and malformed job messages", async () => {
    const unknown = message({ jobId: "does-not-exist" });
    const malformed = message({ nope: true });
    await worker.queue({ queue: "jobs", messages: [unknown.message, malformed.message] }, env());
    expect(unknown.outcome).toEqual({ acked: true, retried: false });
    expect(malformed.outcome).toEqual({ acked: true, retried: false });
  });

  test("asks the queue to retry when processing throws unexpectedly", async () => {
    const broken = { ...env(), DB: { prepare() { throw new Error("D1 unavailable"); }, batch() { throw new Error("D1 unavailable"); } } };
    const m = message({ jobId: "job-1" });
    await worker.queue({ queue: "jobs", messages: [m.message] }, broken);
    expect(m.outcome).toEqual({ acked: false, retried: true });
  });

  test("the scheduled sweep runs against the database", async () => {
    await expect(worker.scheduled({ cron: "*/5 * * * *", scheduledTime: Date.now() }, env())).resolves.toBeUndefined();
  });

  test("the JOBS binding is required", async () => {
    const response = await worker.fetch(new Request("https://app.listingboost.test/api/session"), { ...env(), JOBS: undefined });
    expect(response.status).toBe(500);
  });
});

describe("preset fonts from the static-files binding (D-022)", () => {
  const woff = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 1, 0, 0, 1, 2, 3, 4]);
  const assets = (respond: (path: string) => Response) => ({ fetch: async (request: Request) => respond(new URL(request.url).pathname) });

  test("returns the font file's bytes", async () => {
    const seen: string[] = [];
    const source = presetFontsFrom(assets((path) => (seen.push(path), new Response(woff, { headers: { "Content-Type": "font/woff" } }))));
    expect(new Uint8Array((await source.load("/fonts/lato/lato-regular.woff"))!)).toEqual(woff);
    expect(seen).toEqual(["/fonts/lato/lato-regular.woff"]);
  });

  test("a missing file is null, including when the single-page fallback answers 200 with the app's HTML", async () => {
    expect(await presetFontsFrom(assets(() => new Response("Not found", { status: 404 }))).load("/fonts/x/x-regular.woff")).toBeNull();
    const spaFallback = presetFontsFrom(assets(() => new Response("<!doctype html><html></html>", { status: 200, headers: { "Content-Type": "text/html" } })));
    expect(await spaFallback.load("/fonts/x/x-regular.woff")).toBeNull();
  });

  test("with no binding configured every font is unavailable, not an error", async () => {
    expect(await presetFontsFrom(undefined).load("/fonts/lato/lato-regular.woff")).toBeNull();
  });
});

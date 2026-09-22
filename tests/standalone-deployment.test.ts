import { describe, expect, test } from "bun:test";

const script = new URL("../scripts/validate-standalone-deployment.mjs", import.meta.url).pathname;

async function runGuard(overrides: Record<string, string | undefined>) {
  const env = { ...process.env, ...overrides };
  const processResult = Bun.spawn([process.execPath, script], { env });
  const exitCode = await processResult.exited;
  return { exitCode };
}

const preview = {
  LB_ENVIRONMENT: "preview",
  LB_WORKER_NAME: "listingboost-preview",
  LB_D1_DATABASE_ID: "preview-database-id",
  LB_D1_DATABASE_NAME: "listingboost-preview",
  LB_R2_BUCKET_NAME: "listingboost-preview",
  LB_QUEUE_NAME: "listingboost-preview-generation",
  LB_BETTER_AUTH_URL: "https://listingboost-preview.alex-farley.workers.dev",
};

const production = {
  LB_ENVIRONMENT: "production",
  LB_WORKER_NAME: "listingboost",
  LB_D1_DATABASE_ID: "production-database-id",
  LB_D1_DATABASE_NAME: "listingboost-production",
  LB_R2_BUCKET_NAME: "listingboost-production",
  LB_QUEUE_NAME: "listingboost-generation",
  LB_BETTER_AUTH_URL: "https://listingboost.example.com",
};

describe("standalone deployment resource isolation", () => {
  test("accepts the preview resources", async () => {
    const result = await runGuard(preview);
    expect(result.exitCode).toBe(0);
  });

  test("rejects a production D1 database for preview", async () => {
    const result = await runGuard({
      ...preview,
      LB_D1_DATABASE_NAME: "listingboost-production",
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects a production worker for preview", async () => {
    const result = await runGuard({
      ...preview,
      LB_WORKER_NAME: "listingboost-production",
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects a non-preview queue for preview", async () => {
    const result = await runGuard({
      ...preview,
      LB_QUEUE_NAME: "listingboost-generation",
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects a production route for preview", async () => {
    const result = await runGuard({
      ...preview,
      LB_ROUTE: "listingboost.example.com/*",
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("accepts production resources that are not preview-scoped", async () => {
    const result = await runGuard(production);
    expect(result.exitCode).toBe(0);
  });

  test("rejects a preview D1 database for production", async () => {
    const result = await runGuard({
      ...production,
      LB_D1_DATABASE_NAME: "listingboost-preview",
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects a preview worker for production", async () => {
    const result = await runGuard({
      ...production,
      LB_WORKER_NAME: "listingboost-preview",
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects a preview queue for production", async () => {
    const result = await runGuard({
      ...production,
      LB_QUEUE_NAME: "listingboost-preview-generation",
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects a preview auth URL for production", async () => {
    const result = await runGuard({
      ...production,
      LB_BETTER_AUTH_URL: "https://listingboost-preview.alex-farley.workers.dev",
    });
    expect(result.exitCode).not.toBe(0);
  });
});

import { describe, expect, test } from "bun:test";

const script = new URL("../scripts/validate-standalone-deployment.mjs", import.meta.url).pathname;

async function runGuard(overrides: Record<string, string | undefined>) {
  const env = { ...process.env, ...overrides };
  const processResult = Bun.spawn([process.execPath, script], { env });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processResult.stdout).text(),
    new Response(processResult.stderr).text(),
    processResult.exited,
  ]);
  return { stdout, stderr, exitCode };
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
    expect(`${result.stdout}${result.stderr}`).toContain("D1 database");
  });

  test("rejects a production worker for preview", async () => {
    const result = await runGuard({
      ...preview,
      LB_WORKER_NAME: "listingboost-production",
    });
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("worker");
  });

  test("rejects a non-preview queue for preview", async () => {
    const result = await runGuard({
      ...preview,
      LB_QUEUE_NAME: "listingboost-generation",
    });
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Queue");
  });

  test("rejects a production route for preview", async () => {
    const result = await runGuard({
      ...preview,
      LB_ROUTE: "listingboost.example.com/*",
    });
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("production route");
  });
});

import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const script = join(root, "scripts/generate-standalone-wrangler.mjs");

const baseEnv = {
  ...process.env,
  LB_WORKER_NAME: "listingboost-preview",
  LB_D1_DATABASE_ID: "preview-db-id",
  LB_D1_DATABASE_NAME: "listingboost-preview-db",
  LB_BETTER_AUTH_URL: "https://listingboost-preview.example.com",
  LB_ENVIRONMENT: "preview",
};

async function runGenerator(queueName?: string) {
  const directory = await mkdtemp(join(tmpdir(), "listingboost-wrangler-"));
  const output = join(directory, "wrangler.json");
  try {
    const result = Bun.spawnSync(["node", script, output], {
      cwd: root,
      env: { ...baseEnv, ...(queueName ? { LB_QUEUE_NAME: queueName } : {}) },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      throw new Error(new TextDecoder().decode(result.stderr));
    }
    return JSON.parse(await readFile(output, "utf8")) as {
      queues?: {
        producers?: Array<{ binding: string; queue: string }>;
        consumers?: Array<{ queue: string }>;
      };
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("standalone Wrangler generation queue wiring", () => {
  test("declares both producer and consumer for the ListingBoost queue", async () => {
    const config = await runGenerator("listingboost-preview-generation");
    expect(config.queues?.producers).toEqual([
      { binding: "GENERATION_QUEUE", queue: "listingboost-preview-generation" },
    ]);
    expect(config.queues?.consumers).toEqual([
      { queue: "listingboost-preview-generation" },
    ]);
  });

  test("does not declare queue bindings when no queue is configured", async () => {
    const config = await runGenerator();
    expect(config.queues).toBeUndefined();
  });
});

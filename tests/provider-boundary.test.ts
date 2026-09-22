import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const domainFiles = [
  "src/lib/generation-job.ts",
  "src/lib/generation-orchestrator.ts",
  "src/lib/generation-provider.ts",
  "src/lib/generation-queue.ts",
  "src/lib/generation-worker.ts",
];

const forbiddenPatterns = [/@higgsfield(?:[\w/-]*)?/i, /fnf\.internal/i, /window\.hf\b/i];

describe("provider-neutral generation domain", () => {
  test("does not import or reference provider-specific runtime concepts", () => {
    for (const relativePath of domainFiles) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(forbiddenPatterns.some((pattern) => pattern.test(source))).toBe(false);
    }
  });
});

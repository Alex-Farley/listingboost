import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "../src/server.ts"), "utf8");

describe("standalone Worker entrypoint", () => {
  test("exposes the TanStack fetch handler and ListingBoost generation queue consumer", () => {
    expect(source).toContain('import { handleGenerationQueueBatch');
    expect(source).toContain("async queue(batch: GenerationQueueBatch)");
    expect(source).toContain("createGenerationWorker(bindings())");
    expect(source).toContain("await handleGenerationQueueBatch(batch, worker)");
    expect(source).toContain("fetch(request: Request");
  });

  test("does not import a provider SDK into the Worker entrypoint", () => {
    expect(source).not.toMatch(/@higgsfield\//);
    expect(source).not.toMatch(/fnf\.internal/i);
    expect(source).not.toMatch(/window\.hf\b/i);
  });
});

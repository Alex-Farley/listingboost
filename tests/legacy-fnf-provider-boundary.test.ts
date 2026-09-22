import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const campaignFunctions = readFileSync(join(root, "src/lib/campaigns.functions.ts"), "utf8");
const legacyAdapter = readFileSync(join(root, "src/lib/legacy-fnf-provider.server.ts"), "utf8");

describe("legacy FNF provider boundary", () => {
  test("campaign product code depends on the explicit adapter rather than FNF directly", () => {
    expect(campaignFunctions).toContain("./legacy-fnf-provider.server");
    expect(campaignFunctions).not.toContain("./fnf.server");
    expect(campaignFunctions).not.toContain("fnf.internal");
  });

  test("the compatibility dependency is isolated to the adapter", () => {
    expect(legacyAdapter).toContain("./fnf.server");
    expect(legacyAdapter).toContain("createLegacyFnfProviderAdapter");
  });
});

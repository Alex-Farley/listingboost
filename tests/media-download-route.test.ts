import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "../src/routes/api/media/download.ts"), "utf8");

describe("media download route", () => {
  test("uses ListingBoost R2 as the canonical retained-media path", () => {
    expect(source).toContain("createR2MediaStore");
    expect(source).toContain("bindings().STORAGE");
    expect(source).toContain("campaign-media/${requestedType}/${id}");
    expect(source).toContain("object.body");
  });

  test("fails closed instead of falling back to a provider-owned raw URL", () => {
    expect(source).not.toContain("createLegacyFnfMediaStore");
    expect(source).not.toContain("The legacy FNF");
    expect(source).toContain("fail closed");
    expect(source).toContain("provider-owned raw URL");
  });
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "../src/routes/api/media/download.ts"), "utf8");

describe("media download route", () => {
  test("uses ListingBoost R2 as the canonical retained-media path when available", () => {
    expect(source).toContain("createR2MediaStore");
    expect(source).toContain("bindings().STORAGE");
    expect(source).toContain("campaign-media/${requestedType}/${id}");
    expect(source).toContain("object.body");
  });

  test("keeps the legacy FNF adapter only as a migration fallback", () => {
    expect(source).toContain("createLegacyFnfMediaStore");
    expect(source).toContain("The legacy FNF");
  });
});

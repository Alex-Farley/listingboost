import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ListingBoost identity write boundary", () => {
  test("campaign creation and duplication do not write legacy FNF user_id", () => {
    const source = readFileSync(resolve(import.meta.dir, "../src/lib/campaigns.functions.ts"), "utf8");

    expect(source).not.toContain("INSERT INTO campaigns (id,user_id,auth_user_id");
    expect(source).toContain("INSERT INTO campaigns (id,auth_user_id,listing_url");
  });
});

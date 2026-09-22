import { describe, expect, test } from "bun:test";
import { createListingBoostAuthService } from "../src/lib/auth.server";

describe("ListingBoost auth boundary", () => {
  test("maps an injected session identity to a ListingBoost-owned user id", async () => {
    const statements = [];
    const database = { prepare(sql) {
      statements.push(sql);
      if (sql.startsWith("INSERT")) return { bind: () => ({ run: async () => ({}) }) };
      return { bind: () => ({ first: async () => ({ id: "listingboost-user-123" }) }) };
    }};
    const session = { getCurrentUser: async () => ({ id: "listingboost-user-123" }) };
    const auth = createListingBoostAuthService(database, session);
    await expect(auth.getCurrentUser()).resolves.toEqual({ id: "listingboost-user-123" });
    expect(statements).toEqual([
      "INSERT OR IGNORE INTO auth_users (id) VALUES (?)",
      "SELECT id FROM auth_users WHERE id=?",
    ]);
  });
});

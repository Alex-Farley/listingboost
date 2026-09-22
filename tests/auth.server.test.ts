import { describe, expect, test } from "bun:test";
import { createLegacyFnfAuthService, createListingBoostAuthService } from "../src/lib/auth.server";

describe("ListingBoost auth boundary", () => {
  test("normalizes legacy host identity", async () => {
    const auth = createLegacyFnfAuthService(async () => new Response(JSON.stringify({ user: { id: "legacy-user-123" } })));
    await expect(auth.getCurrentUser()).resolves.toEqual({ id: "legacy-user-123" });
  });
  test("maps unauthenticated host response to no current user", async () => {
    const auth = createLegacyFnfAuthService(async () => new Response(null, { status: 401 }));
    await expect(auth.getCurrentUser()).resolves.toBeNull();
  });
  test("rejects successful responses without an identity", async () => {
    const auth = createLegacyFnfAuthService(async () => new Response(JSON.stringify({ user: {} })));
    await expect(auth.getCurrentUser()).rejects.toThrow("verify your account");
  });
  test("maps an injected session identity to a ListingBoost-owned user id", async () => {
    const statements = [];
    const database = { prepare(sql) {
      statements.push(sql);
      if (sql.startsWith("INSERT")) return { bind: () => ({ run: async () => ({}) }) };
      return { bind: () => ({ first: async () => ({ id: "listingboost-user-123" }) }) };
    }};
    const session = { getCurrentUser: async () => ({ id: "legacy-user-123" }) };
    const auth = createListingBoostAuthService(database, session);
    await expect(auth.getCurrentUser()).resolves.toEqual({ id: "listingboost-user-123" });
    expect(statements).toEqual([
      "INSERT OR IGNORE INTO auth_users (id,legacy_fnf_user_id) VALUES (?,?)",
      "SELECT id FROM auth_users WHERE legacy_fnf_user_id=?",
    ]);
  });
});

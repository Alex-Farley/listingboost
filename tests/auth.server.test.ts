import { describe, expect, test } from "bun:test";
import { createLegacyFnfAuthService } from "../src/lib/auth.server";

describe("ListingBoost auth boundary", () => {
  test("normalizes legacy host identity to ListingBoost auth shape", async () => {
    const auth = createLegacyFnfAuthService(async () => new Response(
      JSON.stringify({ user: { id: "legacy-user-123" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(auth.getCurrentUser()).resolves.toEqual({ id: "legacy-user-123" });
  });

  test("maps unauthenticated host response to no current user", async () => {
    const auth = createLegacyFnfAuthService(async () => new Response(null, { status: 401 }));

    await expect(auth.getCurrentUser()).resolves.toBeNull();
  });

  test("rejects successful responses without an identity", async () => {
    const auth = createLegacyFnfAuthService(async () => new Response(
      JSON.stringify({ user: {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(auth.getCurrentUser()).rejects.toThrow("verify your account");
  });
});

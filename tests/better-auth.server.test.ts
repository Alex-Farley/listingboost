import { describe, expect, test } from "bun:test";
import { createListingBoostBetterAuth } from "../src/lib/better-auth.server";

describe("Better Auth configuration", () => {
  test("requires a production-strength secret", () => {
    expect(() =>
      createListingBoostBetterAuth({
        database: {} as never,
        secret: "too-short",
        baseURL: "https://listingboost.example",
      }),
    ).toThrow("BETTER_AUTH_SECRET");
  });

  test("builds a Cloudflare D1-backed auth instance with a trusted origin", () => {
    const auth = createListingBoostBetterAuth({
      database: {} as never,
      secret: "a".repeat(32),
      baseURL: "https://listingboost.example",
    });

    expect(typeof auth.handler).toBe("function");
    expect(auth.options.baseURL).toBe("https://listingboost.example");
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { validateBetterAuthRuntimeConfig } from "../src/lib/better-auth.server";

describe("Better Auth configuration", () => {
  test("requires a production-strength secret", () => {
    expect(() =>
      validateBetterAuthRuntimeConfig({
        secret: "too-short",
        baseURL: "https://listingboost.example",
      }),
    ).toThrow("BETTER_AUTH_SECRET");
  });

  test("requires a canonical auth URL", () => {
    expect(() =>
      validateBetterAuthRuntimeConfig({
        secret: "a".repeat(32),
        baseURL: "",
      }),
    ).toThrow("BETTER_AUTH_URL");
  });

  test("accepts a valid runtime configuration", () => {
    expect(() =>
      validateBetterAuthRuntimeConfig({
        secret: "a".repeat(32),
        baseURL: "https://listingboost.example",
      }),
    ).not.toThrow();
  });
});

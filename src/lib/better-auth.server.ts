import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { D1Database } from "@cloudflare/workers-types";

export type BetterAuthConfig = {
  database: D1Database;
  secret: string;
  baseURL: string;
};

export type BetterAuthRuntimeConfig = {
  secret: string;
  baseURL: string;
};

export function isBetterAuthRequestPath(pathname: string) {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export function validateBetterAuthRuntimeConfig(config: BetterAuthRuntimeConfig) {
  if (config.secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  if (!config.baseURL) {
    throw new Error("BETTER_AUTH_URL is not configured.");
  }
}

export function createListingBoostBetterAuth(config: BetterAuthConfig) {
  validateBetterAuthRuntimeConfig(config);

  return betterAuth({
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL,
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: [config.baseURL],
    plugins: [tanstackStartCookies()],
    advanced: {
      database: {
        generateId: "uuid",
      },
    },
  });
}

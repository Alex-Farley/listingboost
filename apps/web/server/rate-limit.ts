import { incrementRateLimit, rateLimitCount } from "@listingboost/database";
import type { AppContext } from "./context";
import { HttpError } from "./http";

export type RateLimitPolicy = { name: string; limit: number; windowSeconds: number };

export const SIGN_IN_PER_EMAIL: RateLimitPolicy = { name: "signin-email", limit: 10, windowSeconds: 15 * 60 };
export const SIGN_IN_PER_IP: RateLimitPolicy = { name: "signin-ip", limit: 50, windowSeconds: 15 * 60 };
export const SIGN_UP_PER_IP: RateLimitPolicy = { name: "signup-ip", limit: 10, windowSeconds: 60 * 60 };

function windowFor(policy: RateLimitPolicy, now: Date) {
  const seconds = Math.floor(now.getTime() / 1000);
  const start = seconds - (seconds % policy.windowSeconds);
  return { start, retryAfter: start + policy.windowSeconds - seconds };
}

function limited(retryAfter: number): HttpError {
  return new HttpError(429, "rate_limited", "Too many attempts. Please wait and try again.", undefined, {
    "Retry-After": String(Math.max(1, retryAfter)),
  });
}

/** Throws 429 if the key has already used its allowance in the current window. */
export async function assertNotLimited(ctx: AppContext, policy: RateLimitPolicy, subject: string): Promise<void> {
  const { start, retryAfter } = windowFor(policy, ctx.now());
  if ((await rateLimitCount(ctx.db, `${policy.name}:${subject}`, start)) >= policy.limit) throw limited(retryAfter);
}

export async function recordAttempt(ctx: AppContext, policy: RateLimitPolicy, subject: string): Promise<void> {
  const { start } = windowFor(policy, ctx.now());
  await incrementRateLimit(ctx.db, `${policy.name}:${subject}`, start);
}

/** Counts this attempt and throws 429 once the allowance is exceeded. */
export async function consume(ctx: AppContext, policy: RateLimitPolicy, subject: string): Promise<void> {
  const { start, retryAfter } = windowFor(policy, ctx.now());
  if ((await incrementRateLimit(ctx.db, `${policy.name}:${subject}`, start)) > policy.limit) throw limited(retryAfter);
}

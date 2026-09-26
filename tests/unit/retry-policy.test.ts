import { describe, expect, test } from "bun:test";
import { MAX_ATTEMPTS, retryDelaySeconds, nextStepAfterFailure } from "@listingboost/generation";

describe("AT-20 retry policy", () => {
  test("three attempts in total", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });

  test("exponential backoff", () => {
    expect([1, 2, 3].map(retryDelaySeconds)).toEqual([30, 60, 120]);
  });

  test("transient failures retry until attempts are exhausted", () => {
    expect(nextStepAfterFailure({ transient: true, attempts: 1, maxAttempts: 3 })).toEqual({ action: "retry", delaySeconds: 30 });
    expect(nextStepAfterFailure({ transient: true, attempts: 2, maxAttempts: 3 })).toEqual({ action: "retry", delaySeconds: 60 });
    expect(nextStepAfterFailure({ transient: true, attempts: 3, maxAttempts: 3 })).toEqual({ action: "fail", code: "retries_exhausted" });
  });

  test("permanent failures never retry", () => {
    expect(nextStepAfterFailure({ transient: false, attempts: 1, maxAttempts: 3 })).toEqual({ action: "fail", code: null });
  });
});

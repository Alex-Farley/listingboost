export const MAX_ATTEMPTS = 3;
const BASE_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 15 * 60;

/** Delay before the next attempt, after `attempts` failed attempts. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(BASE_DELAY_SECONDS * 2 ** (attempts - 1), MAX_DELAY_SECONDS);
}

export type FailureStep = { action: "retry"; delaySeconds: number } | { action: "fail"; code: "retries_exhausted" | null };

export function nextStepAfterFailure(input: { transient: boolean; attempts: number; maxAttempts: number }): FailureStep {
  if (!input.transient) return { action: "fail", code: null };
  if (input.attempts >= input.maxAttempts) return { action: "fail", code: "retries_exhausted" };
  return { action: "retry", delaySeconds: retryDelaySeconds(input.attempts) };
}

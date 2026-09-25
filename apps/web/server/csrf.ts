import { HttpError } from "./http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "X-ListingBoost-CSRF";

/**
 * Browsers cannot attach a custom header to a cross-origin request without a
 * CORS preflight, which this API never approves; the Origin check is defence
 * in depth for browsers that send it.
 */
export function assertCsrf(request: Request, appOrigin: string): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get("Origin");
  if (request.headers.get(CSRF_HEADER) !== "1" || (origin !== null && origin !== appOrigin)) {
    throw new HttpError(403, "csrf_rejected", "This request was blocked for your security. Please reload the page and try again.");
  }
}

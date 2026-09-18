import { describe, expect, test } from "bun:test";
import { applySecurityHeaders } from "../src/lib/security-headers.server";

describe("security headers", () => {
  test("allows only the two host approval frame origins", () => {
    const response = applySecurityHeaders(new Response("ok"));
    const policy = response.headers.get("content-security-policy") ?? "";
    const frameSource = policy.split("; ").find((directive) => directive.startsWith("frame-src "));
    expect(frameSource).toBe(
      "frame-src 'self' https://auth.higgsfield.app https://auth.higgsfield-dev.app",
    );
    expect(policy).not.toContain("frame-ancestors");
  });

  test("preserves status and existing response headers", () => {
    const response = applySecurityHeaders(
      new Response("no", { status: 503, headers: { "x-request-id": "request-1" } }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

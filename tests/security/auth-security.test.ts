import { beforeEach, describe, expect, test } from "bun:test";
import { APP_ORIGIN, createTestApp, signUp, type TestApp } from "../support/app";

let app: TestApp;
beforeEach(() => {
  app = createTestApp();
});

const signIn = (email: string, password: string) =>
  app.request("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });

describe("AT-01 authentication security", () => {
  test("passwords are stored as PBKDF2 hashes, never plain text", async () => {
    const account = await signUp(app);
    const row = app.db.raw.query("SELECT password_hash FROM users WHERE id = ?").get(account.user.id) as { password_hash: string };
    expect(row.password_hash.startsWith("pbkdf2-sha256$100000$")).toBe(true);
    expect(row.password_hash).not.toContain(account.password);
  });

  test("session tokens are stored hashed", async () => {
    const account = await signUp(app);
    const token = account.cookie.split("=")[1]!;
    const rows = app.db.raw.query("SELECT id FROM sessions").all() as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(token);
    expect(rows[0]!.id).not.toContain(token);
  });

  test("wrong password and unknown email are indistinguishable", async () => {
    const account = await signUp(app);
    const wrong = await signIn(account.email, "wrong password entirely");
    const unknown = await signIn("nobody@agency.test", "wrong password entirely");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.text()).toBe(await unknown.text());
    expect(wrong.headers.get("Set-Cookie")).toBeNull();
  });

  test("passwords shorter than 12 characters are rejected", async () => {
    const response = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.test", password: "elevenchars", name: "A", agencyName: "B" }),
    });
    expect(response.status).toBe(400);
  });

  test("missing, tampered and unknown session cookies are rejected", async () => {
    await signUp(app);
    expect((await app.request("/api/session")).status).toBe(401);
    expect((await app.request("/api/session", { cookie: "__Host-lb_session=forged" })).status).toBe(401);
    expect((await app.request("/api/session", { cookie: `__Host-lb_session=${"A".repeat(43)}` })).status).toBe(401);
  });

  test("expired sessions are rejected", async () => {
    const account = await signUp(app);
    app.db.raw.run("UPDATE sessions SET expires_at = ?", [new Date(Date.now() - 1000).toISOString()]);
    expect((await app.request("/api/session", { cookie: account.cookie })).status).toBe(401);
  });

  test("sessions expire after 30 days", async () => {
    await signUp(app);
    const row = app.db.raw.query("SELECT created_at, expires_at FROM sessions").get() as { created_at: string; expires_at: string };
    const days = (Date.parse(row.expires_at) - Date.parse(row.created_at)) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  test("repeated failed sign-ins are rate limited, even with the right password afterwards", async () => {
    const account = await signUp(app);
    for (let i = 0; i < 10; i++) expect((await signIn(account.email, `wrong password ${i}`)).status).toBe(401);
    const limited = await signIn(account.email, account.password);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).not.toBeNull();
  });
});

describe("CSRF protection", () => {
  test("state-changing request without the CSRF header is rejected", async () => {
    const response = await app.request("/api/auth/signup", {
      method: "POST",
      csrf: false,
      body: JSON.stringify({ email: "a@b.test", password: "a long enough password", name: "A", agencyName: "B" }),
    });
    expect(response.status).toBe(403);
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(0);
  });

  test("state-changing request from a foreign origin is rejected", async () => {
    const account = await signUp(app);
    const response = await app.request("/api/auth/signout", { method: "POST", cookie: account.cookie, origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect((await app.request("/api/session", { cookie: account.cookie })).status).toBe(200);
  });

  test("same-origin request with the header is accepted", async () => {
    const account = await signUp(app);
    const response = await app.request("/api/auth/signout", { method: "POST", cookie: account.cookie, origin: APP_ORIGIN });
    expect(response.status).toBe(204);
  });
});

describe("safe responses", () => {
  test("security headers are applied to API responses", async () => {
    const response = await app.request("/api/session");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("unknown API routes return a JSON 404", async () => {
    const response = await app.request("/api/does-not-exist");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });

  test("internal errors never leak details", async () => {
    const broken = createTestApp({
      db: {
        prepare() {
          throw new Error("SQLITE secret connection string xyz");
        },
        batch() {
          throw new Error("SQLITE secret connection string xyz");
        },
      },
    });
    const response = await broken.request("/api/auth/signin", { method: "POST", body: JSON.stringify({ email: "a@b.test", password: "whatever password" }) });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret");
    expect(text).not.toContain("SQLITE");
    expect(JSON.parse(text)).toEqual({ error: { code: "internal_error", message: "Something went wrong. Please try again." } });
  });

  test("malformed JSON is a 400, not a 500", async () => {
    const response = await app.request("/api/auth/signin", { method: "POST", body: "{not json" });
    expect(response.status).toBe(400);
  });
});

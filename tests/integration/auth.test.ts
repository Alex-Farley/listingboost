import { beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, sessionCookie, signUp, type TestApp } from "../support/app";

let app: TestApp;
beforeEach(() => {
  app = createTestApp();
});

describe("AT-01 sign up and sign in", () => {
  test("sign-up creates user, organisation and owner membership, and starts a session", async () => {
    const response = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "Jane@Agency.test", password: "a long enough password", name: "Jane", agencyName: "Jane & Co" }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, Record<string, string>>;
    expect(body.user!.email).toBe("jane@agency.test");
    expect(body.organisation!.name).toBe("Jane & Co");
    expect(JSON.stringify(body)).not.toContain("password");

    const member = app.db.raw
      .query("SELECT role FROM organisation_members WHERE user_id = ? AND organisation_id = ?")
      .get(body.user!.id!, body.organisation!.id!) as { role: string } | null;
    expect(member?.role).toBe("owner");

    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("__Host-lb_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  test("session endpoint returns the signed-in user and organisation", async () => {
    const account = await signUp(app);
    const response = await app.request("/api/session", { cookie: account.cookie });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string }; organisation: { id: string } };
    expect(body.user.id).toBe(account.user.id);
    expect(body.organisation.id).toBe(account.organisation.id);
  });

  test("sign-in with correct credentials starts a new session", async () => {
    const account = await signUp(app);
    const response = await app.request("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email: account.email.toUpperCase(), password: account.password }),
    });
    expect(response.status).toBe(200);
    const cookie = sessionCookie(response);
    expect(cookie).not.toBe(account.cookie);
    expect((await app.request("/api/session", { cookie })).status).toBe(200);
  });

  test("sign-out invalidates the session server-side", async () => {
    const account = await signUp(app);
    const out = await app.request("/api/auth/signout", { method: "POST", cookie: account.cookie });
    expect(out.status).toBe(204);
    expect(out.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await app.request("/api/session", { cookie: account.cookie })).status).toBe(401);
  });

  test("invalid sign-up input returns field errors and persists nothing", async () => {
    const response = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", password: "short", name: "", agencyName: "" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe("validation_error");
    expect(Object.keys(body.error.fields).sort()).toEqual(["agencyName", "email", "name", "password"]);
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(0);
  });

  test("duplicate email is rejected with 409", async () => {
    const account = await signUp(app);
    const response = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: account.email, password: "another long password", name: "X", agencyName: "Y" }),
    });
    expect(response.status).toBe(409);
  });
});

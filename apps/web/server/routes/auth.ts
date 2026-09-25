import { createAccount, EmailTakenError, findUserByEmail, primaryMembership } from "@listingboost/database";
import { z } from "zod";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { clearedSessionCookieHeader, endSession, newSessionToken, requireSession, sessionCookieHeader, startSession } from "../auth/session";
import type { AppContext } from "../context";
import { clientIp, HttpError, json, noContent, parseBody } from "../http";
import { assertNotLimited, consume, recordAttempt, SIGN_IN_PER_EMAIL, SIGN_IN_PER_IP, SIGN_UP_PER_IP } from "../rate-limit";
import type { Router } from "../router";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

const signUpSchema = z.object({
  email,
  password: z.string().min(12, "Use at least 12 characters").max(256),
  name: z.string().trim().min(1, "Enter your name").max(100),
  agencyName: z.string().trim().min(1, "Enter your agency name").max(200),
});

const signInSchema = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(256) });

const invalidCredentials = () => new HttpError(401, "invalid_credentials", "Email or password is incorrect.");

export function registerAuthRoutes(router: Router<AppContext>): void {
  router.on("POST", "/api/auth/signup", async (request, _params, ctx) => {
    await consume(ctx, SIGN_UP_PER_IP, clientIp(request));
    const input = await parseBody(request, signUpSchema);
    const session = await newSessionToken(ctx);
    try {
      const account = await createAccount(ctx.db, {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        organisationName: input.agencyName,
        sessionId: session.id,
        sessionExpiresAt: session.expiresAt,
        now: session.now,
      });
      return json(account, 201, { "Set-Cookie": sessionCookieHeader(session.token) });
    } catch (error) {
      if (error instanceof EmailTakenError) throw new HttpError(409, "email_taken", "An account with this email already exists.");
      throw error;
    }
  });

  router.on("POST", "/api/auth/signin", async (request, _params, ctx) => {
    const input = await parseBody(request, signInSchema);
    const ip = clientIp(request);
    await assertNotLimited(ctx, SIGN_IN_PER_EMAIL, input.email);
    await assertNotLimited(ctx, SIGN_IN_PER_IP, ip);

    const user = await findUserByEmail(ctx.db, input.email);
    const valid = user ? await verifyPassword(input.password, user.passwordHash) : (await burnPasswordCheck(input.password), false);
    const membership = user && valid ? await primaryMembership(ctx.db, user.id) : null;
    if (!user || !membership) {
      await recordAttempt(ctx, SIGN_IN_PER_EMAIL, input.email);
      await recordAttempt(ctx, SIGN_IN_PER_IP, ip);
      throw invalidCredentials();
    }
    const token = await startSession(ctx, user.id, membership.organisationId);
    return json({ user: { id: user.id, email: user.email, name: user.name } }, 200, { "Set-Cookie": sessionCookieHeader(token) });
  });

  router.on("POST", "/api/auth/signout", async (request, _params, ctx) => {
    const session = await requireSession(request, ctx);
    await endSession(ctx, session);
    return noContent({ "Set-Cookie": clearedSessionCookieHeader() });
  });

  router.on("GET", "/api/session", async (request, _params, ctx) => {
    const session = await requireSession(request, ctx);
    return json({ user: session.user, organisation: session.organisation, role: session.role });
  });
}

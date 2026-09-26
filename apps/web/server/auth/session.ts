import { deleteSession, findSession, insertSession, type SessionRecord } from "@listingboost/database";
import type { AppContext } from "../context";
import { unauthenticated } from "../http";
import { randomToken, sha256Hex } from "./crypto";

export const SESSION_COOKIE = "__Host-lb_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AuthenticatedSession = SessionRecord & { sessionId: string };

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Issues a new token; only its SHA-256 is persisted. */
export async function newSessionToken(ctx: AppContext): Promise<{ token: string; id: string; now: string; expiresAt: string }> {
  const token = randomToken(32);
  const now = ctx.now();
  return {
    token,
    id: await sha256Hex(token),
    now: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function startSession(ctx: AppContext, userId: string, organisationId: string): Promise<string> {
  const session = await newSessionToken(ctx);
  await insertSession(ctx.db, { id: session.id, userId, organisationId, now: session.now, expiresAt: session.expiresAt });
  return session.token;
}

export async function optionalSession(request: Request, ctx: AppContext): Promise<AuthenticatedSession | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const sessionId = await sha256Hex(token);
  const record = await findSession(ctx.db, sessionId, ctx.now().toISOString());
  return record ? { ...record, sessionId } : null;
}

export async function requireSession(request: Request, ctx: AppContext): Promise<AuthenticatedSession> {
  const session = await optionalSession(request, ctx);
  if (!session) throw unauthenticated();
  return session;
}

export async function endSession(ctx: AppContext, session: AuthenticatedSession): Promise<void> {
  await deleteSession(ctx.db, session.sessionId);
}

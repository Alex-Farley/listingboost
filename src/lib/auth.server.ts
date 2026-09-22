import type { D1Database } from "@cloudflare/workers-types";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createListingBoostBetterAuth, validateBetterAuthRuntimeConfig } from "./better-auth.server";

export type AuthUser = { id: string };

export interface AuthService {
  getCurrentUser(): Promise<AuthUser | null>;
}

export function createLegacyFnfAuthService(fetchUser: typeof fetch = fetch): AuthService {
  return {
    async getCurrentUser() {
      const response = await fetchUser("https://fnf.internal/user");
      if (!response.ok) {
        if (response.status === 401) return null;
        throw new Error("We couldn't verify your account.");
      }
      const body = await response.json().catch(() => null) as unknown;
      const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
      const nested = record.user && typeof record.user === "object" ? record.user as Record<string, unknown> : {};
      const id = record.id ?? record.userId ?? nested.id ?? nested.userId;
      if (typeof id !== "string" || !id) throw new Error("We couldn't verify your account.");
      return { id };
    },
  };
}

type RuntimeConfigLoader = () => BetterAuthRuntimeConfig | Promise<BetterAuthRuntimeConfig>;
type BetterAuthRuntimeConfig = { secret: string; baseURL: string };

async function loadBetterAuthRuntimeConfig(): Promise<BetterAuthRuntimeConfig> {
  const { bindings } = await import("./bindings.server");
  const config = bindings();
  const secret = config.BETTER_AUTH_SECRET;
  const baseURL = config.BETTER_AUTH_URL;
  if (!secret) throw new Error("Authentication is not configured.");
  if (!baseURL) throw new Error("BETTER_AUTH_URL is not configured.");
  validateBetterAuthRuntimeConfig({ secret, baseURL });
  return { secret, baseURL };
}

export function createBetterAuthSessionService(
  database: D1Database,
  getHeaders: () => Headers | Promise<Headers> = getRequestHeaders,
  loadConfig: RuntimeConfigLoader = loadBetterAuthRuntimeConfig,
): AuthService {
  return {
    async getCurrentUser() {
      const config = await loadConfig();
      const auth = createListingBoostBetterAuth({ database, ...config });
      const session = await auth.api.getSession({ headers: await getHeaders() });
      if (!session) return null;
      return { id: session.user.id };
    },
  };
}

/**
 * ListingBoost-owned identity boundary.
 *
 * Better Auth is the authoritative customer authentication provider. The
 * legacy FNF resolver remains available only as an explicit migration adapter;
 * it is never selected implicitly by product code.
 */
export function createListingBoostAuthService(
  database: D1Database,
  session: AuthService = createBetterAuthSessionService(database),
): AuthService {
  return {
    async getCurrentUser() {
      const sessionUser = await session.getCurrentUser();
      if (!sessionUser) return null;

      await database.prepare(
        "INSERT OR IGNORE INTO auth_users (id) VALUES (?)",
      ).bind(sessionUser.id).run();

      const row = await database.prepare(
        "SELECT id FROM auth_users WHERE id=?",
      ).bind(sessionUser.id).first() as { id?: unknown } | null;

      if (!row || typeof row.id !== "string" || !row.id) {
        throw new Error("We couldn't establish your ListingBoost account.");
      }
      return { id: row.id };
    },
  };
}

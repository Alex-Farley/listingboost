import type { D1Database } from "@cloudflare/workers-types";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createListingBoostBetterAuth, validateBetterAuthRuntimeConfig } from "./better-auth.server";

export type AuthUser = { id: string };

export interface AuthService {
  getCurrentUser(): Promise<AuthUser | null>;
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
 * Better Auth is the authoritative customer authentication provider. Product
 * code does not fall back to a Higgsfield/FNF-host identity adapter.
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

import type { D1Database } from "@cloudflare/workers-types";

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

/** ListingBoost-owned identity boundary. During migration, the legacy host
 * proves the current session; domain code receives auth_users.id only. */
export function createListingBoostAuthService(database: D1Database, fetchUser: typeof fetch = fetch): AuthService {
  const legacy = createLegacyFnfAuthService(fetchUser);
  return {
    async getCurrentUser() {
      const legacyUser = await legacy.getCurrentUser();
      if (!legacyUser) return null;
      await database.prepare(
        "INSERT OR IGNORE INTO auth_users (id,legacy_fnf_user_id) VALUES (?,?)",
      ).bind(crypto.randomUUID(), legacyUser.id).run();
      const row = await database.prepare(
        "SELECT id FROM auth_users WHERE legacy_fnf_user_id=?",
      ).bind(legacyUser.id).first() as { id?: unknown } | null;
      if (!row || typeof row.id !== "string" || !row.id) {
        throw new Error("We couldn't establish your ListingBoost account.");
      }
      return { id: row.id };
    },
  };
}

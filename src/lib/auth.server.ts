export type AuthUser = {
  id: string;
};

export interface AuthService {
  getCurrentUser(): Promise<AuthUser | null>;
}

/**
 * Temporary adapter for the prototype host identity.
 * Production adapters must resolve a ListingBoost-owned user ID and must not
 * expose provider-specific identity fields to domain code.
 */
export function createLegacyFnfAuthService(
  fetchUser: typeof fetch = fetch,
): AuthService {
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

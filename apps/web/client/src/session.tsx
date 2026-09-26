import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import type { Session } from "./types";

type SessionState = {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<Session | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

async function fetchSession(): Promise<Session | null> {
  try {
    return await api<Session>("/api/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const current = await fetchSession();
    setSession(current);
    setLoading(false);
    return current;
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/auth/signout", { method: "POST" });
    setSession(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then(
      (current) => {
        if (cancelled) return;
        setSession(current);
        setLoading(false);
      },
      () => !cancelled && setLoading(false),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return <SessionContext.Provider value={{ session, loading, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

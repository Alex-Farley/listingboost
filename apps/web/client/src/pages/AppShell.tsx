import { NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { useSession } from "../session";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <p className="loading" role="status">Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

export function AppShell() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <span className="wordmark">ListingBoost</span>
        <p className="shell__org">{session?.organisation.name}</p>
        <nav aria-label="Main">
          <NavLink to="/app/listings/new">New Listing</NavLink>
          <NavLink to="/app/listings" end>
            My Listings
          </NavLink>
        </nav>
        <div className="shell__account">
          <span>{session?.user.name}</span>
          <button
            className="button button--quiet"
            type="button"
            onClick={async () => {
              await signOut();
              navigate("/signin", { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}

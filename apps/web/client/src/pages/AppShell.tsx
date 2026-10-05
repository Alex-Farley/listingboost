import { NavLink, Navigate, Outlet } from "react-router";
import { useSession } from "../session";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <p className="loading" role="status">Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

export function AppShell() {
  const { session, signOut } = useSession();
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
          <NavLink to="/app/brand">Brand Settings</NavLink>
        </nav>
        <div className="shell__account">
          <span>{session?.user.name}</span>
          <button
            className="button button--quiet"
            type="button"
            // Clearing the session is enough: RequireAuth then redirects to /signin. A second
            // navigate() here could race that redirect and land on the wrong page.
            onClick={() => void signOut()}
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

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import { PropertyForm } from "../components/PropertyForm";
import type { Property } from "../types";

export function ListingsPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "50" });
    if (query.trim()) params.set("q", query.trim());
    api<{ items: Property[] }>(`/api/properties?${params}`)
      .then((page) => !cancelled && setItems(page.items))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not load listings."));
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <>
      <header className="page-header">
        <h1>My Listings</h1>
        <Link className="button button--primary" to="/app/listings/new">
          New listing
        </Link>
      </header>
      <input
        className="search"
        type="search"
        aria-label="Search listings"
        placeholder="Search by title, address, town or postcode"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="banner banner--error" role="alert">{error}</p>}
      {items === null ? (
        <p className="loading" role="status">Loading…</p>
      ) : items.length === 0 ? (
        query ? (
          <p className="empty">No listings match “{query}”.</p>
        ) : (
          <div className="empty">
            <h2>No listings yet</h2>
            <p>Add a property to start its marketing campaign.</p>
            <Link className="button button--primary" to="/app/listings/new">
              New listing
            </Link>
          </div>
        )
      ) : (
        <ul className="listing-list">
          {items.map((p) => (
            <li key={p.id}>
              <Link to={`/app/listings/${p.id}`}>
                <span className="listing-list__title">{p.facts.title}</span>
                <span className="listing-list__meta">
                  {[p.facts.addressLine1, p.facts.town, p.facts.postcode].filter(Boolean).join(", ")}
                </span>
                <span className="listing-list__date">Updated {new Date(p.updatedAt).toLocaleDateString("en-GB")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NewListingPage() {
  const navigate = useNavigate();
  return (
    <>
      <header className="page-header">
        <h1>New listing</h1>
      </header>
      <PropertyForm
        submitLabel="Create listing"
        onSubmit={async (payload) => {
          const property = await api<Property>("/api/properties", { json: payload });
          navigate(`/app/listings/${property.id}`);
        }}
      />
    </>
  );
}

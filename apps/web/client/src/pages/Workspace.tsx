import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useOutletContext, useParams } from "react-router";
import { api, ApiError } from "../api";
import { PROPERTY_TYPE_LABELS, PropertyForm, QUALIFIER_LABELS, TENURE_LABELS } from "../components/PropertyForm";
import type { Property } from "../types";

type WorkspaceContext = { property: Property; reload: () => Promise<void> };

export function useWorkspace(): WorkspaceContext {
  return useOutletContext<WorkspaceContext>();
}

export function ListingWorkspace() {
  const { id } = useParams();
  const [property, setProperty] = useState<Property | null>(null);
  const [missing, setMissing] = useState(false);

  const reload = useCallback(async () => {
    setProperty(await api<Property>(`/api/properties/${id}`));
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    api<Property>(`/api/properties/${id}`).then(
      (p) => !cancelled && setProperty(p),
      (e: unknown) => !cancelled && e instanceof ApiError && e.status === 404 && setMissing(true),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) return <p className="empty">Listing not found.</p>;
  if (!property) return <p className="loading" role="status">Loading…</p>;

  const address = [property.facts.addressLine1, property.facts.town, property.facts.postcode].filter(Boolean).join(", ");
  return (
    <>
      <header className="page-header page-header--stacked">
        <p className="eyebrow">{address}</p>
        <h1>{property.facts.title}</h1>
      </header>
      <nav className="tabs" aria-label="Listing">
        <NavLink to="" end>
          Overview
        </NavLink>
        <NavLink to="images">Images</NavLink>
      </nav>
      <Outlet context={{ property, reload } satisfies WorkspaceContext} />
    </>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "Not recorded";
  return String(value);
}

export function OverviewTab() {
  const { property, reload } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const f = property.facts;

  if (editing) {
    return (
      <PropertyForm
        initial={property}
        submitLabel="Save facts"
        onCancel={() => setEditing(false)}
        onSubmit={async (payload) => {
          await api(`/api/properties/${property.id}`, { method: "PUT", json: payload });
          await reload();
          setEditing(false);
        }}
      />
    );
  }

  const rows: Array<[string, string]> = [
    ["Property type", PROPERTY_TYPE_LABELS[f.propertyType] ?? f.propertyType],
    ["Bedrooms", display(f.bedrooms)],
    ["Bathrooms", display(f.bathrooms)],
    ["Reception rooms", display(f.receptionRooms)],
    ["Floor area", f.floorArea ? `${f.floorArea.value.toLocaleString("en-GB")} ${f.floorArea.unit === "sq_ft" ? "sq ft" : "sq m"}` : "Not recorded"],
    ["Price", f.price ? `${QUALIFIER_LABELS[f.price.qualifier]} £${f.price.amount.toLocaleString("en-GB")}` : "Not recorded"],
    ["Tenure", f.tenure ? TENURE_LABELS[f.tenure]! : "Not recorded"],
    ["Parking", display(f.parking)],
    ["Garden", display(f.garden)],
    ["Key features", display(f.keyFeatures.join(" · "))],
    ["Description", display(f.description)],
  ];

  return (
    <section aria-label="Property facts" className="facts">
      <div className="facts__header">
        <h2>Property facts</h2>
        <button className="button" type="button" onClick={() => setEditing(true)}>
          Edit facts
        </button>
      </div>
      <p className="facts__note">Marketing copy only ever uses the facts recorded here.</p>
      <dl>
        {rows.map(([label, value]) => [<dt key={`${label}-t`}>{label}</dt>, <dd key={`${label}-d`}>{value}</dd>])}
      </dl>
    </section>
  );
}

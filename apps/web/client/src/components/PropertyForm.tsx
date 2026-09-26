import { PRICE_QUALIFIERS, PROPERTY_TYPES, TENURES } from "@listingboost/domain";
import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import type { Property } from "../types";
import { Field } from "./Field";

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  detached: "Detached house",
  semi_detached: "Semi-detached house",
  terraced: "Terraced house",
  end_of_terrace: "End of terrace",
  flat: "Flat / apartment",
  maisonette: "Maisonette",
  bungalow: "Bungalow",
  cottage: "Cottage",
  land: "Land",
  other: "Other",
};
export const TENURE_LABELS: Record<string, string> = {
  freehold: "Freehold",
  leasehold: "Leasehold",
  share_of_freehold: "Share of freehold",
  commonhold: "Commonhold",
};
export const QUALIFIER_LABELS: Record<string, string> = {
  asking_price: "Asking price",
  guide_price: "Guide price",
  offers_over: "Offers over",
  offers_in_excess_of: "Offers in excess of",
  offers_in_region_of: "Offers in the region of",
  fixed_price: "Fixed price",
};

type Values = Record<string, string>;

function toValues(p?: Property): Values {
  const f = p?.facts;
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    title: s(f?.title),
    addressLine1: s(f?.addressLine1),
    addressLine2: s(f?.addressLine2),
    town: s(f?.town),
    county: s(f?.county),
    postcode: s(f?.postcode),
    propertyType: f?.propertyType ?? "detached",
    bedrooms: s(f?.bedrooms),
    bathrooms: s(f?.bathrooms),
    receptionRooms: s(f?.receptionRooms),
    floorAreaValue: s(f?.floorArea?.value),
    floorAreaUnit: f?.floorArea?.unit ?? "sq_ft",
    priceAmount: s(f?.price?.amount),
    priceQualifier: f?.price?.qualifier ?? "",
    tenure: s(f?.tenure),
    parking: s(f?.parking),
    garden: s(f?.garden),
    keyFeatures: (f?.keyFeatures ?? []).join("\n"),
    description: s(f?.description),
    sourceUrl: s(p?.sourceUrl),
    agentName: s(p?.agent?.name),
    agentPhone: s(p?.agent?.phone),
    agentEmail: s(p?.agent?.email),
  };
}

/** Empty inputs become null: unknown facts are never defaulted. */
function toPayload(v: Values) {
  const text = (x: string) => (x.trim() ? x.trim() : null);
  const int = (x: string) => (x.trim() ? Number(x) : null);
  return {
    title: text(v.title!),
    addressLine1: text(v.addressLine1!),
    addressLine2: text(v.addressLine2!),
    town: text(v.town!),
    county: text(v.county!),
    postcode: v.postcode!,
    propertyType: v.propertyType,
    bedrooms: int(v.bedrooms!),
    bathrooms: int(v.bathrooms!),
    receptionRooms: int(v.receptionRooms!),
    floorArea: v.floorAreaValue!.trim() ? { value: Number(v.floorAreaValue), unit: v.floorAreaUnit } : null,
    price: v.priceAmount!.trim() ? { amount: Number(v.priceAmount!.replace(/[£,\s]/g, "")), qualifier: v.priceQualifier } : null,
    tenure: text(v.tenure!),
    parking: text(v.parking!),
    garden: text(v.garden!),
    keyFeatures: v.keyFeatures!.split("\n").map((l) => l.trim()).filter(Boolean),
    description: v.description!.trim(),
    sourceUrl: text(v.sourceUrl!),
    agent: v.agentName!.trim() || v.agentPhone!.trim() || v.agentEmail!.trim()
      ? { name: text(v.agentName!), phone: text(v.agentPhone!), email: text(v.agentEmail!) }
      : null,
  };
}

type Props = { initial?: Property; submitLabel: string; onSubmit: (payload: unknown) => Promise<void>; onCancel?: () => void };

export function PropertyForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bind = (name: string) => ({
    value: values[name] ?? "",
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await onSubmit(toPayload(values));
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const err = (...keys: string[]) => keys.map((k) => errors[k]).find(Boolean);

  return (
    <form className="form" onSubmit={submit} noValidate>
      {formError && <p className="banner banner--error" role="alert">{formError}</p>}
      <fieldset>
        <legend>Address</legend>
        <Field label="Listing title (optional)" error={err("title")} hint="Defaults to the address.">
          {(p) => <input {...p} {...bind("title")} />}
        </Field>
        <Field label="First line of address" error={err("addressLine1")}>{(p) => <input {...p} {...bind("addressLine1")} autoComplete="address-line1" />}</Field>
        <Field label="Second line of address" error={err("addressLine2")}>{(p) => <input {...p} {...bind("addressLine2")} autoComplete="address-line2" />}</Field>
        <div className="form__row">
          <Field label="Town" error={err("town")}>{(p) => <input {...p} {...bind("town")} autoComplete="address-level2" />}</Field>
          <Field label="County" error={err("county")}>{(p) => <input {...p} {...bind("county")} />}</Field>
          <Field label="Postcode" error={err("postcode")}>{(p) => <input {...p} {...bind("postcode")} autoComplete="postal-code" />}</Field>
        </div>
      </fieldset>
      <fieldset>
        <legend>Property facts</legend>
        <p className="form__note">Only record what you know. Anything left blank stays unknown and will never be claimed in marketing.</p>
        <Field label="Property type" error={err("propertyType")}>
          {(p) => (
            <select {...p} {...bind("propertyType")}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          )}
        </Field>
        <div className="form__row">
          <Field label="Bedrooms" error={err("bedrooms")}>{(p) => <input {...p} {...bind("bedrooms")} inputMode="numeric" />}</Field>
          <Field label="Bathrooms" error={err("bathrooms")}>{(p) => <input {...p} {...bind("bathrooms")} inputMode="numeric" />}</Field>
          <Field label="Reception rooms" error={err("receptionRooms")}>{(p) => <input {...p} {...bind("receptionRooms")} inputMode="numeric" />}</Field>
        </div>
        <div className="form__row">
          <Field label="Floor area" error={err("floorArea", "floorArea.value")}>{(p) => <input {...p} {...bind("floorAreaValue")} inputMode="decimal" />}</Field>
          <Field label="Floor area unit" error={err("floorArea.unit")}>
            {(p) => (
              <select {...p} {...bind("floorAreaUnit")}>
                <option value="sq_ft">sq ft</option>
                <option value="sq_m">sq m</option>
              </select>
            )}
          </Field>
        </div>
        <div className="form__row">
          <Field label="Price (£)" error={err("price", "price.amount")}>{(p) => <input {...p} {...bind("priceAmount")} inputMode="numeric" />}</Field>
          <Field label="Price qualifier" error={err("price.qualifier")}>
            {(p) => (
              <select {...p} {...bind("priceQualifier")}>
                <option value="">Choose…</option>
                {PRICE_QUALIFIERS.map((q) => (
                  <option key={q} value={q}>{QUALIFIER_LABELS[q]}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Tenure" error={err("tenure")}>
            {(p) => (
              <select {...p} {...bind("tenure")}>
                <option value="">Not recorded</option>
                {TENURES.map((t) => (
                  <option key={t} value={t}>{TENURE_LABELS[t]}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Parking" error={err("parking")}>{(p) => <input {...p} {...bind("parking")} />}</Field>
        <Field label="Garden" error={err("garden")}>{(p) => <input {...p} {...bind("garden")} />}</Field>
        <Field label="Key features (one per line)" error={err("keyFeatures")}>{(p) => <textarea {...p} {...bind("keyFeatures")} rows={4} />}</Field>
        <Field label="Description" error={err("description")}>{(p) => <textarea {...p} {...bind("description")} rows={5} />}</Field>
      </fieldset>
      <fieldset>
        <legend>Source and agent</legend>
        <Field label="Listing URL (Rightmove, Zoopla or your website)" error={err("sourceUrl")}>{(p) => <input {...p} {...bind("sourceUrl")} inputMode="url" />}</Field>
        <div className="form__row">
          <Field label="Agent name" error={err("agent.name")}>{(p) => <input {...p} {...bind("agentName")} />}</Field>
          <Field label="Agent phone" error={err("agent.phone")}>{(p) => <input {...p} {...bind("agentPhone")} inputMode="tel" />}</Field>
          <Field label="Agent email" error={err("agent.email")}>{(p) => <input {...p} {...bind("agentEmail")} inputMode="email" />}</Field>
        </div>
      </fieldset>
      <div className="form__actions">
        <button className="button button--primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button className="button" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

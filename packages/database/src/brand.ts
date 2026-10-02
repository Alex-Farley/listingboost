import { BRAND_TEMPLATE_SLOTS, type BrandSettingsInput, type BrandTemplateSlot, type PreferredTemplates } from "@listingboost/domain";
import { auditStatement } from "./audit";
import type { OrganisationScope } from "./scope";
import type { SqlDatabase } from "./sql";

/** The organisation's live brand profile. `null` means not set. */
export type BrandProfile = BrandSettingsInput & { logoId: string | null };

type BrandRow = {
  agency_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  office_address: string | null;
  primary_colour: string | null;
  secondary_colour: string | null;
  heading_font: string | null;
  body_font: string | null;
  tone_of_voice: string | null;
  preferred_templates_json: string;
  logo_id: string | null;
};

function parsePreferredTemplates(json: string | undefined): PreferredTemplates {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json ?? "{}");
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: PreferredTemplates = {};
  for (const slot of BRAND_TEMPLATE_SLOTS) {
    const value = (parsed as Record<string, unknown>)[slot];
    if (typeof value === "string" && value) out[slot as BrandTemplateSlot] = value;
  }
  return out;
}

export async function getBrandProfile(db: SqlDatabase, scope: OrganisationScope): Promise<BrandProfile> {
  const row = await db
    .prepare(
      `SELECT agency_name, contact_phone, contact_email, website, office_address, primary_colour, secondary_colour, heading_font, body_font,
              tone_of_voice, preferred_templates_json, logo_id
         FROM brand_settings WHERE organisation_id = ?`,
    )
    .bind(scope.organisationId)
    .first<BrandRow>();
  return {
    agencyName: row?.agency_name ?? null,
    contactPhone: row?.contact_phone ?? null,
    contactEmail: row?.contact_email ?? null,
    website: row?.website ?? null,
    officeAddress: row?.office_address ?? null,
    primaryColour: row?.primary_colour ?? null,
    secondaryColour: row?.secondary_colour ?? null,
    headingFont: row?.heading_font ?? null,
    bodyFont: row?.body_font ?? null,
    toneOfVoice: row?.tone_of_voice ?? null,
    preferredTemplates: parsePreferredTemplates(row?.preferred_templates_json),
    logoId: row?.logo_id ?? null,
  };
}

/** Saves the editable profile. The audit event records who and when, never the values. */
export async function updateBrandProfile(db: SqlDatabase, scope: OrganisationScope, input: BrandSettingsInput, now: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO brand_settings (organisation_id, agency_name, contact_phone, contact_email, website, office_address, primary_colour,
           secondary_colour, heading_font, body_font, tone_of_voice, preferred_templates_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (organisation_id) DO UPDATE SET
           agency_name = excluded.agency_name, contact_phone = excluded.contact_phone, contact_email = excluded.contact_email,
           website = excluded.website, office_address = excluded.office_address, primary_colour = excluded.primary_colour,
           secondary_colour = excluded.secondary_colour, heading_font = excluded.heading_font, body_font = excluded.body_font,
           tone_of_voice = excluded.tone_of_voice, preferred_templates_json = excluded.preferred_templates_json, updated_at = excluded.updated_at`,
      )
      .bind(
        scope.organisationId,
        input.agencyName,
        input.contactPhone,
        input.contactEmail,
        input.website,
        input.officeAddress,
        input.primaryColour,
        input.secondaryColour,
        input.headingFont,
        input.bodyFont,
        input.toneOfVoice,
        JSON.stringify(input.preferredTemplates),
        now,
      ),
    auditStatement(db, scope, { action: "brand_settings.updated", subjectType: "brand_settings", subjectId: scope.organisationId, now }),
  ]);
}

/** True when the font is one of this organisation's uploads and has not been removed. */
export async function isSelectableFont(db: SqlDatabase, scope: OrganisationScope, fontId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM brand_fonts WHERE id = ? AND organisation_id = ? AND removed_at IS NULL")
    .bind(fontId, scope.organisationId)
    .first<{ found: number }>();
  return row !== null;
}

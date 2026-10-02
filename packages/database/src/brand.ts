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

export type LogoRecord = {
  id: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  originalFilename: string;
  originalFormat: "png" | "jpeg" | "webp" | "svg";
  createdAt: string;
};

type LogoRow = {
  id: string;
  object_key: string;
  content_type: string;
  byte_size: number;
  width: number;
  height: number;
  original_filename: string;
  original_format: LogoRecord["originalFormat"];
  created_at: string;
};

const LOGO_COLUMNS = "id, object_key, content_type, byte_size, width, height, original_filename, original_format, created_at";

const toLogo = (r: LogoRow): LogoRecord => ({
  id: r.id,
  objectKey: r.object_key,
  contentType: r.content_type,
  byteSize: r.byte_size,
  width: r.width,
  height: r.height,
  originalFilename: r.original_filename,
  originalFormat: r.original_format,
  createdAt: r.created_at,
});

/** Every logo the organisation has uploaded, newest first. Replaced logos are kept for restore. */
export async function listLogos(db: SqlDatabase, scope: OrganisationScope): Promise<LogoRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${LOGO_COLUMNS} FROM brand_logos WHERE organisation_id = ? ORDER BY created_at DESC, rowid DESC`)
    .bind(scope.organisationId)
    .all<LogoRow>();
  return results.map(toLogo);
}

export async function getLogo(db: SqlDatabase, scope: OrganisationScope, logoId: string): Promise<LogoRecord | null> {
  const row = await db
    .prepare(`SELECT ${LOGO_COLUMNS} FROM brand_logos WHERE id = ? AND organisation_id = ?`)
    .bind(logoId, scope.organisationId)
    .first<LogoRow>();
  return row ? toLogo(row) : null;
}

function setCurrentLogoStatement(db: SqlDatabase, scope: OrganisationScope, logoId: string, now: string) {
  return db
    .prepare(
      `INSERT INTO brand_settings (organisation_id, logo_id, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (organisation_id) DO UPDATE SET logo_id = excluded.logo_id, updated_at = excluded.updated_at`,
    )
    .bind(scope.organisationId, logoId, now);
}

/** Records an uploaded logo and makes it current. The earlier logo stays in the history. */
export async function addLogo(db: SqlDatabase, scope: OrganisationScope, logo: Omit<LogoRecord, "createdAt">, now: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO brand_logos (id, organisation_id, object_key, content_type, byte_size, width, height, original_filename, original_format,
           uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        logo.id,
        scope.organisationId,
        logo.objectKey,
        logo.contentType,
        logo.byteSize,
        logo.width,
        logo.height,
        logo.originalFilename,
        logo.originalFormat,
        scope.userId,
        now,
      ),
    setCurrentLogoStatement(db, scope, logo.id, now),
    auditStatement(db, scope, { action: "brand_logo.uploaded", subjectType: "brand_logo", subjectId: logo.id, now }),
  ]);
}

/** Makes an earlier logo current again. Nothing is deleted. The caller has checked the logo is in scope. */
export async function restoreLogo(db: SqlDatabase, scope: OrganisationScope, logoId: string, now: string): Promise<void> {
  await db.batch([
    setCurrentLogoStatement(db, scope, logoId, now),
    auditStatement(db, scope, { action: "brand_logo.restored", subjectType: "brand_logo", subjectId: logoId, now }),
  ]);
}

/**
 * For signed-URL downloads only: the signature proves a tenant-scoped lookup
 * already authorised this file.
 */
export async function getLogoForSignedDownload(db: SqlDatabase, logoId: string): Promise<{ objectKey: string; contentType: string } | null> {
  const row = await db.prepare("SELECT object_key, content_type FROM brand_logos WHERE id = ?").bind(logoId).first<{ object_key: string; content_type: string }>();
  return row ? { objectKey: row.object_key, contentType: row.content_type } : null;
}

-- R10 brand settings (work/001-brand-settings): logo history, custom fonts,
-- the current-logo pointer and the per-campaign brand snapshot.

-- Every logo an organisation has uploaded. Replaced logos stay for owner
-- restore while the organisation exists. SVG uploads are stored as PNG only.
CREATE TABLE brand_logos (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  byte_size INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  original_format TEXT NOT NULL CHECK (original_format IN ('png','jpeg','webp','svg')),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (id, organisation_id)
);
CREATE INDEX idx_brand_logos_org ON brand_logos(organisation_id, created_at DESC);

-- Custom fonts. `format` is what is stored (WOFF2 uploads are converted);
-- removed_at hides a font from selection but the file is kept.
CREATE TABLE brand_fonts (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  object_key TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('ttf','otf','woff')),
  original_format TEXT NOT NULL CHECK (original_format IN ('ttf','otf','woff','woff2')),
  byte_size INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  rights_confirmed_by TEXT NOT NULL REFERENCES users(id),
  rights_confirmed_at TEXT NOT NULL,
  removed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (id, organisation_id)
);
CREATE INDEX idx_brand_fonts_org ON brand_fonts(organisation_id, created_at);

-- brand_settings is rebuilt rather than altered, for three reasons:
--   1. The colour checks in 0001 used a 61-byte GLOB pattern. Cloudflare D1
--      rejects LIKE and GLOB patterns over 50 bytes ("LIKE or GLOB pattern too
--      complex"), so saving any colour failed on D1 while passing on SQLite.
--      The checks below say the same thing with short patterns.
--   2. The current logo must be one of the organisation's own logos, which
--      needs a composite foreign key that ALTER TABLE cannot add.
--   3. Preferred templates are now a map of slot to template id, so the
--      column's default changes from '[]' to '{}'.
-- logo_media_key is no longer used but is kept, so the previous Worker version
-- (which still selects it) keeps working if a deploy has to be rolled back.
-- The font columns held unused free text and now hold font references only.
CREATE TABLE brand_settings_new (
  organisation_id TEXT PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  agency_name TEXT,
  logo_media_key TEXT,
  logo_id TEXT,
  primary_colour TEXT CHECK (primary_colour IS NULL OR (
    length(primary_colour) = 7 AND primary_colour GLOB '#*' AND substr(primary_colour, 2) NOT GLOB '*[^0-9A-Fa-f]*')),
  secondary_colour TEXT CHECK (secondary_colour IS NULL OR (
    length(secondary_colour) = 7 AND secondary_colour GLOB '#*' AND substr(secondary_colour, 2) NOT GLOB '*[^0-9A-Fa-f]*')),
  heading_font TEXT,
  body_font TEXT,
  tone_of_voice TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,
  office_address TEXT,
  preferred_templates_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (logo_id, organisation_id) REFERENCES brand_logos(id, organisation_id)
);

INSERT INTO brand_settings_new (organisation_id, agency_name, logo_media_key, logo_id, primary_colour, secondary_colour, heading_font, body_font, tone_of_voice,
  contact_phone, contact_email, website, office_address, preferred_templates_json, updated_at)
SELECT organisation_id, agency_name, logo_media_key, NULL, primary_colour, secondary_colour,
  CASE WHEN heading_font LIKE 'preset:%' OR heading_font LIKE 'custom:%' THEN heading_font END,
  CASE WHEN body_font LIKE 'preset:%' OR body_font LIKE 'custom:%' THEN body_font END,
  tone_of_voice, contact_phone, contact_email, website, office_address,
  CASE preferred_templates_json WHEN '[]' THEN '{}' ELSE preferred_templates_json END,
  updated_at
FROM brand_settings;

DROP TABLE brand_settings;
ALTER TABLE brand_settings_new RENAME TO brand_settings;

-- Brand values captured when a campaign is created. Tone of voice is not
-- captured: it is stored on the profile only (D-017, OD-2).
ALTER TABLE campaigns ADD COLUMN brand_snapshot_json TEXT;

-- Existing campaigns get their organisation's settings as of this migration,
-- which is what they would render with today. Free-text font names were never
-- used by the renderer and are not font references, so fonts start unset.
UPDATE campaigns
SET brand_snapshot_json = (
  SELECT json_object(
    'agencyName', b.agency_name,
    'contactPhone', b.contact_phone,
    'contactEmail', b.contact_email,
    'website', b.website,
    'officeAddress', b.office_address,
    'primaryColour', b.primary_colour,
    'secondaryColour', b.secondary_colour,
    'headingFont', NULL,
    'bodyFont', NULL,
    'logoId', NULL,
    'preferredTemplates', json('{}')
  )
  FROM brand_settings b
  WHERE b.organisation_id = campaigns.organisation_id
);

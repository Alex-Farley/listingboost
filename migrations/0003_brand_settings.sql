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

-- SQLite cannot add a composite foreign key to an existing table, so the
-- same-organisation rule for the current logo is enforced by triggers.
ALTER TABLE brand_settings ADD COLUMN logo_id TEXT;

CREATE TRIGGER brand_settings_logo_same_org_insert
BEFORE INSERT ON brand_settings
WHEN NEW.logo_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM brand_logos WHERE id = NEW.logo_id AND organisation_id = NEW.organisation_id)
BEGIN
  SELECT RAISE(ABORT, 'brand_settings.logo_id must be a logo of the same organisation');
END;

CREATE TRIGGER brand_settings_logo_same_org_update
BEFORE UPDATE OF logo_id ON brand_settings
WHEN NEW.logo_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM brand_logos WHERE id = NEW.logo_id AND organisation_id = NEW.organisation_id)
BEGIN
  SELECT RAISE(ABORT, 'brand_settings.logo_id must be a logo of the same organisation');
END;

-- Preferred templates are a map of slot to template id.
UPDATE brand_settings SET preferred_templates_json = '{}' WHERE preferred_templates_json = '[]';

-- Font columns held unused free text; they now hold font references only.
UPDATE brand_settings SET heading_font = NULL
  WHERE heading_font IS NOT NULL AND heading_font NOT LIKE 'preset:%' AND heading_font NOT LIKE 'custom:%';
UPDATE brand_settings SET body_font = NULL
  WHERE body_font IS NOT NULL AND body_font NOT LIKE 'preset:%' AND body_font NOT LIKE 'custom:%';

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

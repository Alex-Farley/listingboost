-- ListingBoost initial schema (D1 / SQLite).
--
-- Tenant integrity: every tenant-owned row carries organisation_id and refers
-- to its parent through a composite key that includes organisation_id, so the
-- database itself rejects cross-organisation references (ARCHITECTURE §3).
-- Timestamps are ISO-8601 UTC strings written by the application.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE organisation_members (
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organisation_id, user_id)
);
CREATE INDEX idx_members_user ON organisation_members(user_id);

-- id is the SHA-256 of the session token; the token itself is never stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (organisation_id, user_id) REFERENCES organisation_members(organisation_id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE brand_settings (
  organisation_id TEXT PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  agency_name TEXT,
  logo_media_key TEXT,
  primary_colour TEXT CHECK (primary_colour IS NULL OR primary_colour GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  secondary_colour TEXT CHECK (secondary_colour IS NULL OR secondary_colour GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  heading_font TEXT,
  body_font TEXT,
  tone_of_voice TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,
  office_address TEXT,
  preferred_templates_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT NOT NULL,
  property_type TEXT NOT NULL CHECK (property_type IN
    ('detached','semi_detached','terraced','end_of_terrace','flat','maisonette','bungalow','cottage','land','other')),
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms INTEGER CHECK (bathrooms IS NULL OR bathrooms >= 0),
  reception_rooms INTEGER CHECK (reception_rooms IS NULL OR reception_rooms >= 0),
  floor_area_value REAL CHECK (floor_area_value IS NULL OR floor_area_value > 0),
  floor_area_unit TEXT CHECK (floor_area_unit IS NULL OR floor_area_unit IN ('sq_ft','sq_m')),
  price_amount INTEGER CHECK (price_amount IS NULL OR price_amount > 0),
  price_qualifier TEXT CHECK (price_qualifier IS NULL OR price_qualifier IN
    ('asking_price','guide_price','offers_over','offers_in_excess_of','offers_in_region_of','fixed_price')),
  tenure TEXT CHECK (tenure IS NULL OR tenure IN ('freehold','leasehold','share_of_freehold','commonhold')),
  parking TEXT,
  garden TEXT,
  key_features_json TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  agent_name TEXT,
  agent_phone TEXT,
  agent_email TEXT,
  source_url TEXT,
  fact_provenance_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK ((floor_area_value IS NULL) = (floor_area_unit IS NULL)),
  CHECK ((price_amount IS NULL) = (price_qualifier IS NULL)),
  UNIQUE (id, organisation_id)
);
CREATE INDEX idx_properties_org_updated ON properties(organisation_id, updated_at DESC);

CREATE TABLE property_media (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY (property_id, organisation_id) REFERENCES properties(id, organisation_id) ON DELETE CASCADE,
  UNIQUE (id, organisation_id),
  UNIQUE (id, property_id, organisation_id)
);
CREATE INDEX idx_property_media_property ON property_media(property_id, position);
CREATE UNIQUE INDEX idx_property_media_one_primary ON property_media(property_id) WHERE is_primary = 1;

CREATE TABLE templates (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  aspect_ratio TEXT,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','generating','in_review','completed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (property_id, organisation_id) REFERENCES properties(id, organisation_id) ON DELETE CASCADE,
  UNIQUE (id, organisation_id),
  UNIQUE (id, property_id, organisation_id)
);
CREATE INDEX idx_campaigns_org_updated ON campaigns(organisation_id, updated_at DESC);
CREATE INDEX idx_campaigns_property ON campaigns(property_id);

CREATE TABLE campaign_assets (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('enhanced_photo','social_post','story','reel','copy')),
  slot_key TEXT NOT NULL,
  aspect_ratio TEXT CHECK (aspect_ratio IS NULL OR aspect_ratio IN ('original','1:1','4:5','9:16')),
  source_media_id TEXT,
  template_id TEXT,
  template_version INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  discarded_at TEXT,
  FOREIGN KEY (campaign_id, property_id, organisation_id) REFERENCES campaigns(id, property_id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (source_media_id, property_id, organisation_id) REFERENCES property_media(id, property_id, organisation_id),
  FOREIGN KEY (template_id, template_version) REFERENCES templates(id, version),
  UNIQUE (campaign_id, slot_key),
  UNIQUE (id, organisation_id),
  UNIQUE (id, campaign_id, organisation_id)
);
CREATE INDEX idx_campaign_assets_campaign ON campaign_assets(campaign_id, sort_order);

CREATE TABLE asset_versions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  origin TEXT NOT NULL CHECK (origin IN ('generation','manual_edit')),
  state TEXT NOT NULL CHECK (state IN
    ('queued','processing','completed','failed','cancelled','needs_review','approved','rejected')),
  treatment TEXT CHECK (treatment IS NULL OR treatment IN ('enhancement','visualisation')),
  disclosure_label TEXT,
  text_content TEXT,
  output_object_key TEXT UNIQUE,
  output_content_type TEXT,
  output_byte_size INTEGER,
  output_width INTEGER,
  output_height INTEGER,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  template_version INTEGER,
  parameters_json TEXT NOT NULL DEFAULT '{}',
  reference_media_ids_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id),
  CHECK (treatment IS NOT 'visualisation' OR disclosure_label IS 'POTENTIAL VISUALISATION — Digitally generated • Illustrative only'),
  CHECK (treatment IS NOT 'enhancement' OR disclosure_label IS NULL),
  CHECK (state IS NOT 'approved' OR approved_at IS NOT NULL),
  FOREIGN KEY (asset_id, campaign_id, organisation_id) REFERENCES campaign_assets(id, campaign_id, organisation_id) ON DELETE CASCADE,
  UNIQUE (asset_id, version_number),
  UNIQUE (id, organisation_id)
);
CREATE INDEX idx_asset_versions_asset ON asset_versions(asset_id, version_number DESC);
CREATE INDEX idx_asset_versions_campaign ON asset_versions(campaign_id, state);

-- Mirrors packages/domain/src/asset-state.ts TRANSITIONS. A test checks every pair.
CREATE TRIGGER asset_versions_valid_transition
BEFORE UPDATE OF state ON asset_versions
WHEN NEW.state IS NOT OLD.state
  AND (OLD.state || '>' || NEW.state) NOT IN (
    'queued>processing', 'queued>cancelled',
    'processing>completed', 'processing>failed', 'processing>cancelled', 'processing>queued',
    'completed>needs_review',
    'needs_review>approved', 'needs_review>rejected')
BEGIN
  SELECT RAISE(ABORT, 'invalid_transition');
END;

-- Approved versions are immutable (spec §17, §24). Fires before the
-- transition trigger's checks matter, so it also blocks approved -> *.
CREATE TRIGGER asset_versions_approved_immutable
BEFORE UPDATE ON asset_versions
WHEN OLD.state = 'approved'
BEGIN
  SELECT RAISE(ABORT, 'version_immutable');
END;

CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  version_id TEXT NOT NULL UNIQUE,
  capability TEXT NOT NULL CHECK (capability IN
    ('image_enhancement','image_generation','video_generation','text_generation','upscale','template_render')),
  request_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts > 0),
  next_run_at TEXT NOT NULL,
  lease_expires_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  last_error_transient INTEGER CHECK (last_error_transient IS NULL OR last_error_transient IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (version_id, organisation_id) REFERENCES asset_versions(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_generation_jobs_next_run ON generation_jobs(next_run_at);

-- Raw provider results (provenance), one row per successful attempt output.
CREATE TABLE generation_outputs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('media','text')),
  object_key TEXT,
  content_type TEXT,
  byte_size INTEGER,
  text_content TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  CHECK ((kind = 'media') = (object_key IS NOT NULL))
);
CREATE INDEX idx_generation_outputs_job ON generation_outputs(job_id);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT REFERENCES organisations(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_events_org ON audit_events(organisation_id, created_at DESC);

-- Generation lifecycle state is ListingBoost-owned. Provider identifiers are provenance only.
CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  campaign_asset_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_key TEXT,
  provider_model TEXT,
  provider_job_id TEXT,
  provider_request_id TEXT,
  prompt_version TEXT,
  estimated_cost_usd REAL,
  actual_cost_usd REAL,
  failure_code TEXT,
  failure_message TEXT,
  failure_retryable INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_asset_id) REFERENCES campaign_assets(id) ON DELETE CASCADE,
  UNIQUE (campaign_asset_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_campaign
  ON generation_jobs(campaign_id, created_at);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_asset
  ON generation_jobs(campaign_asset_id, attempt DESC);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_provider_job
  ON generation_jobs(provider_key, provider_job_id);

ALTER TABLE campaign_assets ADD COLUMN asset_key TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE campaign_assets ADD COLUMN generation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE campaign_assets ADD COLUMN generation_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_assets ADD COLUMN generation_error TEXT;
ALTER TABLE campaign_assets ADD COLUMN provider_model TEXT;
ALTER TABLE campaign_assets ADD COLUMN provider_job_id TEXT;
ALTER TABLE campaign_assets ADD COLUMN prompt_version TEXT;
ALTER TABLE campaign_assets ADD COLUMN source_media_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE campaign_assets ADD COLUMN generation_job_id TEXT REFERENCES generation_jobs(id);

CREATE INDEX IF NOT EXISTS idx_campaign_assets_key
  ON campaign_assets(campaign_id, asset_key);

CREATE INDEX IF NOT EXISTS idx_campaign_assets_generation_status
  ON campaign_assets(campaign_id, generation_status);

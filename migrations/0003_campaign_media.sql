CREATE TABLE IF NOT EXISTS campaign_media (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER,
  provider_key TEXT,
  provider_media_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_media_campaign
  ON campaign_media(campaign_id, created_at);

CREATE INDEX IF NOT EXISTS idx_campaign_media_provider
  ON campaign_media(provider_key, provider_media_id);

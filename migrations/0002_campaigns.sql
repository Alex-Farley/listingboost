-
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  listing_url TEXT NOT NULL,
  details TEXT NOT NULL,
  event_type TEXT NOT NULL,
  brand_name TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL,
  source_images_json TEXT NOT NULL,
  copy TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_updated
  ON campaigns(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS campaign_assets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, title)
);

CREATE INDEX IF NOT EXISTS idx_campaign_assets_campaign
  ON campaign_assets(campaign_id, sort_order);

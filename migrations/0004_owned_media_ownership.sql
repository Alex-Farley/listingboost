ALTER TABLE campaign_media ADD COLUMN owner_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_media_owner
  ON campaign_media(owner_user_id, created_at);

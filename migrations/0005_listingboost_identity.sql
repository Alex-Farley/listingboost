CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  legacy_fnf_user_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE campaigns ADD COLUMN auth_user_id TEXT;

INSERT OR IGNORE INTO auth_users (id, legacy_fnf_user_id)
SELECT user_id, user_id FROM campaigns WHERE user_id IS NOT NULL;

UPDATE campaigns
SET auth_user_id = (
  SELECT id FROM auth_users WHERE auth_users.legacy_fnf_user_id = campaigns.user_id
)
WHERE auth_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_auth_user_updated
  ON campaigns(auth_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_users_legacy_fnf
  ON auth_users(legacy_fnf_user_id);
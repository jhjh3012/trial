CREATE TABLE IF NOT EXISTS licence_transfers (
  keyword_hash TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS licence_transfers_updated_at_idx
  ON licence_transfers (updated_at);
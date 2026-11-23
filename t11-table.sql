CREATE TABLE IF NOT EXISTS player_t11 (
  player_id INTEGER PRIMARY KEY,
  infantry INTEGER NOT NULL DEFAULT 0 CHECK (infantry >= 0),
  cavalry INTEGER NOT NULL DEFAULT 0 CHECK (cavalry >= 0),
  archer INTEGER NOT NULL DEFAULT 0 CHECK (archer >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_player_t11_total
ON player_t11 (infantry, cavalry, archer);

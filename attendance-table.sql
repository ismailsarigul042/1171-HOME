CREATE TABLE IF NOT EXISTS event_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('yes', 'maybe', 'no')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_event_id
ON event_attendance (event_id);

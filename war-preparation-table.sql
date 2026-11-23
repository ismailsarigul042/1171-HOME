CREATE TABLE IF NOT EXISTS war_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  battle_date TEXT NOT NULL,
  battle_time TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS war_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  territory TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('attack', 'defense', 'support')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (operation_id, player_id)
);

CREATE TABLE IF NOT EXISTS war_readiness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'not_ready')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (operation_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_war_assignments_operation ON war_assignments(operation_id);
CREATE INDEX IF NOT EXISTS idx_war_readiness_operation ON war_readiness(operation_id);

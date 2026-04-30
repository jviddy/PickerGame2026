CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  entrant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  selected_teams_json TEXT NOT NULL,
  selected_team_ids_json TEXT NOT NULL,
  tie_breaker_answers_json TEXT NOT NULL,
  total_cost INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at
  ON entries (created_at);

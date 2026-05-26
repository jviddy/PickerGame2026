-- 0002: Change entry uniqueness constraints
-- Replace email-only uniqueness with (email + name) combo unique; add team name uniqueness

CREATE TABLE entries_new (
  id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  team_name_normalized TEXT NOT NULL UNIQUE,
  entrant_name TEXT NOT NULL,
  entrant_name_normalized TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  selected_teams_json TEXT NOT NULL,
  selected_team_ids_json TEXT NOT NULL,
  tie_breaker_answers_json TEXT NOT NULL,
  total_cost INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(email_normalized, entrant_name_normalized)
);

INSERT INTO entries_new (
  id, team_name, team_name_normalized, entrant_name, entrant_name_normalized,
  email, email_normalized, selected_teams_json, selected_team_ids_json,
  tie_breaker_answers_json, total_cost, created_at
)
SELECT
  id,
  team_name,
  lower(team_name),
  entrant_name,
  lower(entrant_name),
  email,
  email_normalized,
  selected_teams_json,
  selected_team_ids_json,
  tie_breaker_answers_json,
  total_cost,
  created_at
FROM entries;

DROP TABLE entries;
ALTER TABLE entries_new RENAME TO entries;

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries (created_at);

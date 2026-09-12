-- Phase 1: a migration baseline. User-data tables arrive with the auth/progress phases.
CREATE TABLE IF NOT EXISTS schema_migrations_note (
  id integer PRIMARY KEY,
  note text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations_note (id, note)
VALUES (1, 'Migration infrastructure initialized')
ON CONFLICT (id) DO NOTHING;

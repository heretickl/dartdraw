-- DartDraw database schema.
-- Paste this into the Neon SQL Editor once when setting up the project.

CREATE TABLE organizers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tournaments (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES organizers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournaments_owner_updated ON tournaments (created_by, updated_at DESC);

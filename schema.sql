-- DartDraw database schema.
-- Paste this into the Neon SQL Editor once when setting up the project.

CREATE TABLE organizers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL DEFAULT 'organizer' CHECK (role IN ('organizer', 'admin')),
  tier          text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'pro')),
  suspended     boolean NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  token_version integer NOT NULL DEFAULT 0,
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

-- Emailed single-use tokens (only the SHA-256 hash is stored).
CREATE TABLE auth_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('verify', 'reset', 'invite')),
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_tokens_organizer_kind ON auth_tokens (organizer_id, kind);

-- Rate-limit counters.
CREATE TABLE auth_throttle (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL
);

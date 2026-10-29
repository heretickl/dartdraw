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

-- Site-wide settings edited from the Admin tab (public home page retention).
-- Until a row exists the app uses its defaults (resultsDays 14, liveHours 48).
CREATE TABLE site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Player library: each organiser's own players (see migrations/2026-10-29-players.sql).
CREATE TABLE players (
  id            text PRIMARY KEY,
  organizer_id  uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name          text NOT NULL,
  club          text NOT NULL DEFAULT '',
  aliases       text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz
);

CREATE UNIQUE INDEX players_org_name_club ON players (organizer_id, lower(name), lower(club)) WHERE removed_at IS NULL;
CREATE INDEX players_org ON players (organizer_id);

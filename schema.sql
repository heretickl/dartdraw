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

-- Floor officials: per-event scoring links (see migrations/2026-10-30-floor-officials.sql).
CREATE TABLE event_officials (
  id            text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  organizer_id  uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name          text NOT NULL,
  boards        int[] NOT NULL DEFAULT '{}',
  token_hash    text NOT NULL UNIQUE,
  link_nonce    text NOT NULL,            -- the link is rebuilt from it and the server secret (Copy link), never stored
  pin           text NOT NULL,
  ends_at       timestamptz NOT NULL,
  stopped_at    timestamptz,
  last_seen_at  timestamptz,
  results       int NOT NULL DEFAULT 0,
  refused       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_officials_tournament ON event_officials (tournament_id);

-- Live scoring (see migrations/2026-11-05-live-scoring.sql for what each table is for).
-- live_logins: the event's one scoring login (tournament-wide), kept here and NOT in the tournament JSON so the public copy and
-- the sanitizer can never carry it. password_hash is what the server checks; password_shown is the password as generated, kept so
-- the organiser can see it again (as with the officials' PIN).
CREATE TABLE live_logins (
  tournament_id  text PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  username       text NOT NULL,
  password_hash  text NOT NULL,
  password_shown text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- live_devices: one row per tablet/phone signed in to an event. session_nonce changes on every sign-in, so an old session stops
-- working. logged_out_at is set when the organiser or the finalise step ends the device. unsent: how many turns the device says
-- it still holds (shown to the organiser before a logout).
CREATE TABLE live_devices (
  id            text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  board         int,
  session_nonce text NOT NULL,
  last_seen_at  timestamptz,
  logged_out_at timestamptz,
  unsent        int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_devices_tournament ON live_devices (tournament_id);

-- live_matches: one row per match scored live, keyed by its position in the event (pos). state follows the match lifecycle
-- (called, checked in, playing, awaiting confirm, confirmed ...). played_on_board is the board it was really played on.
-- summary is the public one-line picture (legs a/b, remaining a/b, thrower), rewritten on every turn; the viewer reads it.
-- changed_by_organiser is set when the organiser entered a result over the device's match.
CREATE TABLE live_matches (
  tournament_id        text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  pos                  text NOT NULL,
  state                text NOT NULL,
  device_id            text,
  board                int,
  played_on_board      int,
  paper                boolean NOT NULL DEFAULT false,
  retired_side         text,
  started_at           timestamptz,
  ended_at             timestamptz,
  summary              jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by_organiser boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tournament_id, pos)
);

-- live_turns: every turn a device keyed. APPEND-ONLY: the code never runs UPDATE or DELETE on this table. A correction is a new
-- row whose supersedes names the turn it replaces. id is made by the device and doubles as the idempotency key, so a turn sent
-- twice (bad Wi-Fi, retry) is stored once; it is unique within an event (the primary key is tournament_id + id).
-- ignored: the turn was stored but never applied (it came from a device that had been taken over, or after the event was
-- finalised or closed); ignored_reason says why. It is set when the row is inserted, never by a later update.
CREATE TABLE live_turns (
  id            text NOT NULL,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  pos           text NOT NULL,
  leg           int NOT NULL,
  side          text NOT NULL,
  player        text,
  entered       jsonb NOT NULL,
  device_id     text NOT NULL,
  supersedes    text,
  ignored       boolean NOT NULL DEFAULT false,
  ignored_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, id)
);
CREATE INDEX idx_live_turns_match ON live_turns (tournament_id, pos, created_at);

-- live_takeovers: a second device asking to take over a match the first one is scoring. decided_by says who answered (the
-- current device, the organiser, or a timeout); answer is the outcome; decided_at stays empty while it is still waiting.
CREATE TABLE live_takeovers (
  id            text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  pos           text NOT NULL,
  from_device   text NOT NULL,
  to_device     text NOT NULL,
  decided_by    text,
  answer        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);
CREATE INDEX idx_live_takeovers_match ON live_takeovers (tournament_id, pos);

-- live_lends: a free board lent whole to a busy board (before any match row exists for it). ended_at is empty while the lend
-- is running.
CREATE TABLE live_lends (
  id            text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  from_board    int NOT NULL,
  to_board      int NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz
);
CREATE INDEX idx_live_lends_tournament ON live_lends (tournament_id);

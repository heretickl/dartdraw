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

-- Player accounts and casual play (see migrations/2026-11-05-player-accounts.sql).

-- A player's own login. The email is kept lower-cased so the same address always matches. A player with no
-- email_verified_at has not confirmed the address yet. created_by_admin is set when an organiser made the account.
CREATE TABLE player_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,                 -- lower-cased
  password_hash text NOT NULL,
  first_name text NOT NULL, last_name text NOT NULL,
  email_verified_at timestamptz,              -- NULL = not confirmed
  must_change_password boolean NOT NULL DEFAULT false,
  token_version integer NOT NULL DEFAULT 0,
  name_changed_at timestamptz,
  created_by_admin uuid REFERENCES organizers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One-time links for confirming an address ('verify') or choosing a new password ('reset'). Only a hash of the
-- link's token is stored, and a used or expired row cannot be used again.
CREATE TABLE player_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('verify','reset')),
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per entry on an owner's friends list. friend_id is filled in once a confirmed account with that email
-- exists. A removed entry keeps its row (removed_at set) so its history stays readable.
CREATE TABLE friendships (                    -- one row per owner's list entry
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  email text NOT NULL,                        -- lower-cased
  first_name text NOT NULL, last_name text NOT NULL, nickname text NOT NULL DEFAULT '',
  friend_id uuid REFERENCES player_accounts(id),   -- set once a confirmed account matches the email
  status text NOT NULL CHECK (status IN ('linked','waiting','none')),
  requested_at timestamptz, removed_at timestamptz,
  invited_at timestamptz,                     -- last Invite to DartDraw email (at most one a week)
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Only one live entry per owner and email; removed rows do not count.
CREATE UNIQUE INDEX friendships_owner_email ON friendships (owner_id, email) WHERE removed_at IS NULL;

-- Who has blocked whom. The blocker is the player who made the block.
CREATE TABLE friend_blocks (blocker_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id));

-- A casual game recorded once. The id is made by the app, so saving the same game twice does nothing new.
-- side_a and side_b keep each side's name, and the player or friends-list entry it belongs to when there is one.
CREATE TABLE casual_games (
  id text PRIMARY KEY,                        -- client-made uuid; makes saving idempotent
  recorded_by uuid NOT NULL REFERENCES player_accounts(id),
  format jsonb NOT NULL, events jsonb NOT NULL,
  side_a jsonb NOT NULL, side_b jsonb NOT NULL, -- { name, player_id|null, friendship_id|null }
  winner text NOT NULL CHECK (winner IN ('a','b')),
  played_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- The same game as it counts for each player in it. status is 'saved' or 'held' (see the spec for what held means).
CREATE TABLE player_games (                   -- a game as it counts for one player
  game_id text NOT NULL REFERENCES casual_games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('a','b')),
  status text NOT NULL CHECK (status IN ('saved','held')),
  kind text NOT NULL DEFAULT 'casual' CHECK (kind IN ('casual','venue','tournament')),
  stats jsonb NOT NULL, won boolean NOT NULL, played_at timestamptz NOT NULL,
  PRIMARY KEY (game_id, player_id)
);
-- Lets a player's history load newest first.
CREATE INDEX player_games_player ON player_games (player_id, played_at DESC);

-- Notices for a player. kind and data say what happened; read_at is set once the player has seen it.
CREATE TABLE player_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);

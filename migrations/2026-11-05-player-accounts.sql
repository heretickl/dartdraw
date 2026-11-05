-- Player accounts and casual play (spec: docs/superpowers/specs/2026-11-04-accounts-scorecard-venue-design.md and
-- docs/superpowers/specs/2026-11-03-casual-play-design.md).
-- Paste into the Neon SQL Editor and run once. Plain CREATE only, no DROP: a second run stops at the first table that exists.

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

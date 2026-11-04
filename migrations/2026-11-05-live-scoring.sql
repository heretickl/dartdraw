-- Live scoring: tablets/phones score matches at the board (spec: docs/superpowers/specs/2026-11-04-online-organizer-design.md, section 15).
-- Paste into the Neon SQL Editor and run once. Safe to run again: it changes nothing the second time.
-- Until it has been run, every live-scoring call fails with Postgres 42P01 (table does not exist).
--
-- Six tables, each tied to its event (deleting the event deletes them):
--   live_logins    the event's one scoring login (username + password hash)
--   live_devices   the tablets/phones signed in to the event
--   live_matches   one row per match scored live: state, board, device, public summary
--   live_turns     every turn a device keyed (append-only; ignored turns are flagged, never deleted)
--   live_takeovers requests to take a match over from another device
--   live_lends     a free board lent to a busy board
--
-- Viewer note (comment only): the public viewer's read-only database role gets SELECT on these tables in a later step,
-- in viewer/sql. Nothing here grants anything.

-- live_logins: the event's one scoring login (tournament-wide), kept here and NOT in the tournament JSON so the public copy and
-- the sanitizer can never carry it. password_hash is what the server checks; password_shown is the password as generated, kept so
-- the organiser can see it again (as with the officials' PIN).
CREATE TABLE IF NOT EXISTS live_logins (
  tournament_id  text PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  username       text NOT NULL,
  password_hash  text NOT NULL,
  password_shown text NOT NULL,
  session_nonce  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- usernames are unique across the whole table (a device signs in with the username alone). session_nonce: New password changes it,
-- which logs every device of the event out (a device session carries the nonce it signed in with).
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_logins_username ON live_logins (username);

-- live_devices: one row per tablet/phone signed in to an event. session_nonce changes on every sign-in, so an old session stops
-- working. logged_out_at is set when the organiser or the finalise step ends the device. unsent: how many turns the device says
-- it still holds (shown to the organiser before a logout).
CREATE TABLE IF NOT EXISTS live_devices (
  id            text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  board         int,
  session_nonce text NOT NULL,
  last_seen_at  timestamptz,
  logged_out_at timestamptz,
  unsent        int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_devices_tournament ON live_devices (tournament_id);

-- live_matches: one row per match scored live, keyed by its position in the event (pos). state follows the match lifecycle
-- (called, checked in, playing, awaiting confirm, confirmed ...). played_on_board is the board it was really played on.
-- summary is the public one-line picture (legs a/b, remaining a/b, thrower), rewritten on every turn; the viewer reads it.
-- changed_by_organiser is set when the organiser entered a result over the device's match.
CREATE TABLE IF NOT EXISTS live_matches (
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
CREATE TABLE IF NOT EXISTS live_turns (
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
CREATE INDEX IF NOT EXISTS idx_live_turns_match ON live_turns (tournament_id, pos, created_at);

-- live_takeovers: a second device asking to take over a match the first one is scoring. decided_by says who answered
-- ('org:<organiser id>', 'off:<floor official id>' or 'system' when the request went void by itself); answer is the outcome
-- ('allow', 'deny' or 'void'); both stay empty while the request is still waiting. Every request and every answer is kept.
CREATE TABLE IF NOT EXISTS live_takeovers (
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
CREATE INDEX IF NOT EXISTS idx_live_takeovers_match ON live_takeovers (tournament_id, pos);
-- at most ONE waiting request per match: a second request for the same match is refused (takeover_pending)
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_takeovers_pending ON live_takeovers (tournament_id, pos) WHERE answer IS NULL;

-- live_lends: a free board lent whole to a busy board (before any match row exists for it). ended_at is empty while the lend
-- is running.
CREATE TABLE IF NOT EXISTS live_lends (
  id            text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  from_board    int NOT NULL,
  to_board      int NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_live_lends_tournament ON live_lends (tournament_id);

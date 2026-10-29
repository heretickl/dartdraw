-- Player library (spec: docs/superpowers/specs/2026-10-29-player-library-design.md).
-- Paste into the Neon SQL Editor and run once. Safe to run again: it changes nothing the second time.

-- Each organiser's own players (name and club). A removed player keeps its row (removed_at set) and comes back when
-- the same name and club is added again. A merge keeps one row and lists the merged-away ids in its aliases, so the
-- events those ids were used in count for the kept player. Events keep their own copies of the names.
CREATE TABLE IF NOT EXISTS players (
  id            text PRIMARY KEY,
  organizer_id  uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name          text NOT NULL,
  club          text NOT NULL DEFAULT '',
  aliases       text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS players_org_name_club
  ON players (organizer_id, lower(name), lower(club)) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS players_org ON players (organizer_id);

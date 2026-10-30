-- Floor officials (spec: docs/superpowers/specs/2026-10-30-floor-officials-design.md).
-- Paste into the Neon SQL Editor and run once. Safe to run again: it changes nothing the second time.

-- One row per floor official of one event. The link's token is HMAC(server secret, id:link_nonce), so a copy of the
-- table alone cannot open any link; it is looked up by its SHA-256 hash. The PIN is kept as
-- typed so the organiser can see it again (it travels in the same message as the link anyway). A stopped official
-- keeps the row (stopped_at set), so their name still shows on the results they entered. refused: the last results
-- the server did not take from this official (board changed, link ended), for the organiser to key in by hand.
CREATE TABLE IF NOT EXISTS event_officials (
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
CREATE INDEX IF NOT EXISTS idx_event_officials_tournament ON event_officials (tournament_id);

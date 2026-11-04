-- Live scores for the public results site (Live scoring: matches scored on tablets at the board).
-- Run this once in the Neon SQL Editor, AFTER migrations/2026-11-05-live-scoring.sql (it creates live_matches) and AFTER
-- viewer/sql/readonly.sql (it creates the viewer_ro role). Safe to run again: CREATE OR REPLACE VIEW, and the grant changes
-- nothing the second time. Until it has been run the public site simply shows no live scores (results still work).
--
-- The viewer site connects as viewer_ro, which can read ONLY views. This view lets it read the running matches of Live
-- events, and nothing else from the live tables: no login, no device ids, no turns, no take-over requests, and none of
-- live_matches' own flags (changed_by_organiser, disputed, paper). Nothing in the live_* tables is granted to viewer_ro.
--
--   * only events the organiser published (same rule as public_tournaments) that score Live (format.scoring.mode = 'live')
--   * only matches that have started or are over: playing, awaitingConfirm, confirmed, retired. A waiting match has no
--     live picture yet, and a match scored on paper (paper = true) never appears.
--   * a match the organiser entered a result for over a tablet (changed_by_organiser) is left out; the flag itself is not shown.
--   * summary is rebuilt here with only the keys the public page reads: legs, remaining, thrower and last (the last 6 turns:
--     leg, side, score, left). tot (x01 points and darts per side) is included ONLY when the organiser switched "public
--     stats" on (format.scoring.publicStats). Any other key in live_matches.summary stays private. (The viewer's code gates
--     tot and per-match x01 on the same switch as well.)
--   * pos is the match's place in the event ('rr:<group>:<pair>' or 'ko:<bracket>:<round>:<match>'), which is how the
--     public page finds the match; it holds no player data.

CREATE OR REPLACE VIEW live_public AS
  SELECT
    t.data->>'publicSlug' AS slug,
    m.pos,
    m.state,
    m.board,
    m.played_on_board,
    jsonb_build_object(
      'legs',      m.summary->'legs',
      'remaining', m.summary->'remaining',
      'thrower',   m.summary->'thrower',
      'last',      m.summary->'last'
    ) || CASE WHEN t.data->'format'->'scoring'->>'publicStats' = 'true'
              THEN jsonb_build_object('tot', m.summary->'tot')
              ELSE '{}'::jsonb END AS summary
  FROM live_matches m
  JOIN tournaments t ON t.id = m.tournament_id
  WHERE t.data->>'published' = 'true'
    AND t.data->>'publicSlug' IS NOT NULL
    AND t.data->'format'->'scoring'->>'mode' = 'live'
    AND m.state IN ('playing', 'awaitingConfirm', 'confirmed', 'retired')
    AND NOT m.paper
    AND NOT m.changed_by_organiser;

-- viewer_ro is created by readonly.sql; if it is not there yet the grant is skipped (run this file again after creating it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viewer_ro') THEN
    GRANT SELECT ON live_public TO viewer_ro;
  ELSE
    RAISE NOTICE 'Role viewer_ro does not exist yet: run viewer/sql/readonly.sql, then run this file again.';
  END IF;
END
$$;

-- Public retention settings for the home page (Admin tab -> Settings).
-- Run this once in the Neon SQL Editor, AFTER migrations/2026-10-14-admin.sql (it creates the site_settings table)
-- and after viewer/sql/readonly.sql (it creates the viewer_ro role). Safe to run again.
--
-- The viewer site connects as viewer_ro, which cannot read site_settings. This view exposes only the two
-- retention numbers (resultsDays, liveHours) and nothing else from that table.
-- Until this is run the public site uses its built-in defaults: 14 days of results, 48 hours of live.

CREATE OR REPLACE VIEW public_settings AS
  SELECT key, value
  FROM site_settings
  WHERE key IN ('resultsDays', 'liveHours');

GRANT SELECT ON public_settings TO viewer_ro;

-- Admin tab (spec: docs/superpowers/specs/2026-10-14-admin-tab-design.md).
-- Paste into the Neon SQL Editor and run once. Safe to run again: it changes nothing the second time.

-- Site-wide settings edited from the Admin tab (public home page retention: resultsDays, liveHours).
-- Until a row exists the app uses its defaults (14 days, 48 hours).
CREATE TABLE IF NOT EXISTS site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

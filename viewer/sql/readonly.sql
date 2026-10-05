-- Read-only database access for the public results site.
-- Run this once in the Neon SQL Editor (on the same database the DartDraw
-- organiser app uses), after schema.sql. Replace the password first.
--
-- The viewer site never connects as the organiser app does. It connects as
-- viewer_ro, which can read ONE thing: the public_tournaments view below,
-- i.e. only tournaments whose organiser ticked "Publish results". It cannot
-- see organisers or unpublished tournaments, and it cannot write anything.

CREATE OR REPLACE VIEW public_tournaments AS
  SELECT data->>'publicSlug' AS slug, data, updated_at
  FROM tournaments
  WHERE data->>'published' = 'true'
    AND data->>'publicSlug' IS NOT NULL;

CREATE ROLE viewer_ro LOGIN PASSWORD 'replace-with-a-long-random-password';
GRANT USAGE ON SCHEMA public TO viewer_ro;
GRANT SELECT ON public_tournaments TO viewer_ro;

-- Optional: speeds up the slug lookup once there are many tournaments.
CREATE INDEX IF NOT EXISTS idx_tournaments_public_slug ON tournaments ((data->>'publicSlug'));

-- Then build the viewer project's DATABASE_URL from the Neon pooled
-- connection string, swapping in this user and password:
--   postgresql://viewer_ro:<password>@ep-xxxx-pooler.<region>.aws.neon.tech/<db>?sslmode=require

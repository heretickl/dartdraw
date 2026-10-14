-- Organiser accounts and login (spec: docs/superpowers/specs/2026-10-13-organiser-accounts-design.md).
-- Paste into the Neon SQL Editor and run once. Safe to run again: it changes nothing the second time.

-- 1. New organizers columns, plus grandfathering of the accounts that exist right now.
--    The whole block is skipped when email_verified_at already exists, so a re-run can never
--    reset the tier or verification of an account that signed up after the migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'organizers' AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE organizers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'organizer' CHECK (role IN ('organizer', 'admin'));
    ALTER TABLE organizers ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'pro'));
    ALTER TABLE organizers ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
    ALTER TABLE organizers ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
    ALTER TABLE organizers ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

    -- Every existing real account is verified and Pro. The shared "Public" row is left
    -- unverified and Basic (its password_hash is 'disabled', so it can never sign in).
    UPDATE organizers SET email_verified_at = now(), tier = 'pro'
    WHERE email <> 'public@dartdraw.local';
  END IF;
END $$;

-- 2. Emailed single-use tokens (only the SHA-256 hash is stored).
CREATE TABLE IF NOT EXISTS auth_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('verify', 'reset', 'invite')),
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_organizer_kind ON auth_tokens (organizer_id, kind);

-- 3. Rate-limit counters.
CREATE TABLE IF NOT EXISTS auth_throttle (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL
);

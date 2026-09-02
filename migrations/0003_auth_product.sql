-- ================================================================
-- 0003_auth_product.sql — turns the single-product (Workforce) auth
-- schema into the shared Whitehabbit account layer used by BOTH
-- Workforce and Knowledge.
--
-- Additive and non-destructive: every existing user/org/membership
-- row is preserved. Existing users are explicitly backfilled as
-- already-onboarded (onboarding_completed_at = created_at) so the new
-- onboarding gate NEVER interrupts a returning Workforce user.
-- ================================================================

-- ---- users: support OAuth + profile + onboarding ----------------
-- password_hash becomes nullable: a Google (OAuth) account has no
-- local password. Credentials accounts still always set it.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image_url             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider         TEXT NOT NULL DEFAULT 'credentials'; -- credentials | google
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at BIGINT;

-- Backfill: everyone who already existed predates onboarding and must
-- be treated as done, or they would be bounced into /welcome on next
-- login. New sign-ups get NULL and go through onboarding once.
UPDATE users SET onboarding_completed_at = created_at WHERE onboarding_completed_at IS NULL;

-- ---- user_interests: the future personalization signal ----------
-- Captured in onboarding step 2. Deliberately just a normalized tag
-- per row — no recommendation engine is built on it yet.
CREATE TABLE IF NOT EXISTS user_interests (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, topic)
);
CREATE INDEX IF NOT EXISTS idx_user_interests_user ON user_interests(user_id);

-- ---- password_reset_tokens: real, single-use, expiring ----------
-- Only the SHA-256 hash of the token is stored, never the token
-- itself (same principle as password hashing) — a database leak does
-- not hand out working reset links. Sending the link by email
-- requires an email provider (see .env.example); the row + contract
-- are fully real regardless of whether email is wired yet.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  used_at    BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);

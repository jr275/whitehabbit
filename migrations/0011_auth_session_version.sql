-- ================================================================
-- 0011_auth_session_version.sql — make a password reset actually end
-- the old sessions, and give email verification somewhere to live.
--
-- THE PROBLEM THIS SOLVES. Sessions are JWTs signed with AUTH_SECRET
-- and validated by decrypting the cookie. Nothing is stored, so
-- nothing can be revoked: after a password reset the attacker's
-- existing cookie keeps working until it expires on its own. Changing
-- the password is exactly the moment someone is trying to eject an
-- intruder, and it was the one thing that did not eject them.
--
-- The smallest fix compatible with JWT sessions is a version number
-- the token carries and the server compares. Bump it and every token
-- minted before the bump stops validating. No session table, no
-- server-side session store, no Auth.js rewrite — one integer.
--
-- WHY DEFAULT 0 AND NOT 1. Tokens already in the wild carry no
-- version at all. requireSession() reads a missing claim as 0, which
-- matches this default, so deploying this migration does not sign
-- everyone out — only a real reset does. Logging out every user to
-- ship a security fix is its own incident.
--
-- Follows the conventions of 0001/0003: BIGINT epoch-millisecond
-- timestamps, prefixed TEXT ids, cascade from users.
--
-- Migrations 0001-0010 are untouched. Every statement is idempotent.
-- ================================================================

-- ---- users.session_version -------------------------------------
--
-- Incremented whenever every existing session for this account must
-- stop working. Today that is exactly one event — a completed
-- password reset — and it should stay a short list.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- ---- email_verification_tokens ---------------------------------
--
-- Same shape and the same rules as password_reset_tokens (0003):
-- only the SHA-256 hash is stored, so a database leak yields no
-- usable links; single-use via used_at; expiring via expires_at.
--
-- NOTE ON PRODUCT SCOPE. This table and its flow are real, but
-- nothing yet BLOCKS an unverified account from signing in. Making
-- verification mandatory changes who can use the product and locks
-- out every account created before it existed — a product decision,
-- not one this migration should make quietly. Until that decision is
-- taken, users.email_verified_at simply records whether it happened.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The address being proven. Stored explicitly rather than read from
  -- users.email at consumption time: verifying an address someone has
  -- since changed away from must not mark the NEW address verified.
  email      TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at    BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at BIGINT;

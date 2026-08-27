-- ================================================================
-- 0013_connection_credentials.sql — Phase 2A architectural hardening:
-- ONE credential store, connection-scoped, for every non-OAuth auth
-- kind (api_key, bearer_token, basic_auth, mcp_bearer) — generalizing
-- migrations/0012_custom_connector_credentials.sql (which was scoped
-- to custom_connector_id, additive infrastructure never actually
-- wired to execution — see that file's header) so it now serves as
-- the real backing store for BOTH built-in and custom connectors'
-- non-OAuth credentials, keyed by connections.id — the one entity
-- both connector families already share.
--
-- WHY connection_id, not custom_connector_id: `connections` is the
-- one table every connector family — static/built-in AND dynamic/
-- custom — already resolves to (a custom connector's mirrored
-- `connections` row uses the "custom_<id>" connector_id convention,
-- lib/connectors/custom-connector-id.ts). Keying the generic
-- credential store off connection_id, the same way oauth_credentials
-- already does, means ONE shape ("a Connection's credential(s)") for
-- every connector, instead of a built-in/custom split.
--
-- WHY NOT fold oauth_credentials into this table too: an OAuth2 token
-- pair has a genuinely different lifecycle (access+refresh with a
-- queryable, unencrypted expiry the runtime checks on every call
-- without decrypting anything — lib/connectors/token-store.ts's
-- getValidAccessToken) that a generic opaque secret blob doesn't need
-- and shouldn't be forced into. Two physical stores, ONE logical
-- resolution boundary (lib/connectors/credential-resolver.ts) is the
-- chosen shape — see that file's header for the full reasoning.
--
-- label + is_primary is what makes this "one connection can have
-- multiple credentials" real: several named, independently encrypted
-- credentials per connection (e.g. "Production"/"Staging" API keys,
-- or a future rotated-but-not-yet-cut-over replacement), with exactly
-- one marked primary — the one the runtime actually resolves by
-- default (enforced by a partial unique index, not just convention).
-- Rotation = insert a new labeled row, flip is_primary, optionally
-- delete the old one later — never an in-place secret overwrite that
-- could blank a credential mid-rotation.
--
-- kind records which of the credential shapes
-- (lib/connectors/types.ts's CustomConnectorCredential union, plus
-- "legacy" for pre-migration rows whose real kind isn't re-derived
-- here) this row holds — informational/defensive, the actual
-- encrypted JSON blob already self-describes via its own `type` field
-- once decrypted.
--
-- Migration steps:
--   1. Rename the table (same physical storage, generalized meaning).
--   2. Add connection_id/kind/is_primary columns.
--   3. Backfill: ensure every custom_connectors row that has a
--      credential (either the legacy 1:1 credential_encrypted column,
--      or an existing row in this table) has a mirrored `connections`
--      row to hang its credential(s) off (the exact upsert
--      app/api/custom-connectors/[id]/test/route.ts already performs
--      post-test, run here for any connector whose credential
--      predates its first successful test).
--   4. Migrate custom_connectors.credential_encrypted's ciphertext
--      (copied verbatim — same AES-256-GCM secret-box format, same
--      ENCRYPTION_KEY, no decrypt/re-encrypt needed or performed here)
--      into one primary "Default"-labeled row per connector that had
--      one set.
--   5. Backfill connection_id on any pre-existing (label-scoped)
--      custom_connector_credentials rows the same way.
--   6. Re-point the unique index from (custom_connector_id, label) to
--      (connection_id, label); add the partial unique "one primary
--      per connection" index.
--
-- custom_connectors.credential_encrypted itself is left in place,
-- untouched (no ALTER, no DROP) — non-destructive, matching every
-- other migration in this set; it is simply no longer read or written
-- by application code after this phase (see lib/db/repo.ts's
-- setCustomConnectorCredential/getCustomConnectorCredential, now thin
-- wrappers over this table).
-- ================================================================

ALTER TABLE custom_connector_credentials RENAME TO connection_credentials;

ALTER TABLE connection_credentials ADD COLUMN IF NOT EXISTS connection_id TEXT;
ALTER TABLE connection_credentials ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE connection_credentials ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- custom_connector_id is no longer how new rows are addressed —
-- relax NOT NULL so a fresh, connection-scoped INSERT never needs to
-- supply it. The column and its data are kept (never dropped) so
-- existing rows' provenance stays inspectable.
ALTER TABLE connection_credentials ALTER COLUMN custom_connector_id DROP NOT NULL;

-- Step 3: ensure a mirrored `connections` row exists for every
-- custom_connectors row that has ever held a credential (the legacy
-- column, or an existing plural-table row), even if it predates any
-- successful POST .../test — mirrors the exact upsert
-- app/api/custom-connectors/[id]/test/route.ts's own logic already
-- performs (connector_id = 'custom_' || id, authType 'api_key' for a
-- REST connector or 'mcp' for an MCP connector, status carried over
-- from the connector's own current status, 'not_connected' when
-- neither applies).
INSERT INTO connections (id, org_id, connector_id, status, auth_type, display_name, metadata, created_at, updated_at)
SELECT
  'conn_' || substr(md5(cc.id || ':migration-0013'), 1, 24),
  cc.org_id,
  'custom_' || cc.id,
  CASE WHEN cc.status = 'connected' THEN 'connected' ELSE 'not_connected' END,
  CASE WHEN cc.kind = 'mcp' THEN 'mcp' ELSE 'api_key' END,
  cc.name,
  '{}'::jsonb,
  cc.created_at,
  cc.updated_at
FROM custom_connectors cc
WHERE (cc.credential_encrypted IS NOT NULL OR EXISTS (SELECT 1 FROM connection_credentials ccred WHERE ccred.custom_connector_id = cc.id))
  AND NOT EXISTS (SELECT 1 FROM connections c WHERE c.org_id = cc.org_id AND c.connector_id = 'custom_' || cc.id);

-- Step 4: migrate the legacy single-credential column into one
-- primary "Default" row per connector, ciphertext copied verbatim.
INSERT INTO connection_credentials (id, org_id, connection_id, custom_connector_id, label, kind, credential_encrypted, is_primary, created_at, updated_at, created_by)
SELECT
  'ccred_' || substr(md5(cc.id || ':legacy-default'), 1, 24),
  cc.org_id,
  c.id,
  cc.id,
  'Default',
  'legacy',
  cc.credential_encrypted,
  true,
  cc.updated_at,
  cc.updated_at,
  cc.created_by
FROM custom_connectors cc
JOIN connections c ON c.org_id = cc.org_id AND c.connector_id = 'custom_' || cc.id
WHERE cc.credential_encrypted IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM connection_credentials ccred WHERE ccred.connection_id = c.id AND ccred.label = 'Default');

-- Step 5: backfill connection_id on any pre-existing plural-table rows.
UPDATE connection_credentials ccred
SET connection_id = c.id,
    kind = COALESCE(ccred.kind, 'legacy')
FROM custom_connectors cc
JOIN connections c ON c.org_id = cc.org_id AND c.connector_id = 'custom_' || cc.id
WHERE ccred.custom_connector_id = cc.id AND ccred.connection_id IS NULL;

-- Any row this migration could not resolve a connection for (should
-- be none, given step 3 — defensive only) is left as-is rather than
-- guessed at; connection_id stays nullable at the column level so no
-- data is silently dropped, but every code path going forward always
-- supplies it, and the indexes below make an unresolved row
-- unreachable by the new connection-scoped queries (a real, visible
-- gap an operator could still find via custom_connector_id, never a
-- silently corrupted row).

DROP INDEX IF EXISTS idx_custom_connector_credentials_connector_label;
DROP INDEX IF EXISTS idx_custom_connector_credentials_connector;
CREATE INDEX IF NOT EXISTS idx_connection_credentials_connection ON connection_credentials(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_credentials_connection_label ON connection_credentials(connection_id, label);
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_credentials_connection_primary ON connection_credentials(connection_id) WHERE is_primary;

-- New rows are keyed primarily by connection_id (custom_connector_id
-- is still populated by the custom-connector-facing repo wrappers,
-- purely to preserve the existing ON DELETE CASCADE from
-- custom_connectors — see lib/db/repo.ts's setConnectionCredential).
-- This FK gives the same real cascade behavior via connection_id
-- alone, so a credential is never orphaned regardless of which
-- identity ends up deleted first. Nullable: an unresolved legacy row
-- (should be none after the backfill above) is never silently
-- dropped by adding this constraint.
ALTER TABLE connection_credentials ADD CONSTRAINT connection_credentials_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE;

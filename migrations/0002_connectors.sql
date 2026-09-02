-- ================================================================
-- 0002_connectors.sql — Connector Foundation (Phase 1).
--
-- ONE new table. ConnectorDefinitions (lib/connectors/registry.ts)
-- are a static, code-defined catalog — same pattern as
-- SKILL_CATALOG/TOOL_CATALOG (lib/workforce/catalog.ts) — so they are
-- never a database table. `connections` is the one genuinely
-- per-organization, mutable fact this phase needs to persist: "this
-- org attempted/has a connection to this connector."
--
-- No credential/secret table yet — Phase 1 has no real OAuth/API key
-- to store (only the internal test connector, authenticationType
-- "none"). `metadata` is JSONB for non-secret facts only; a real
-- encrypted credential store is explicitly Phase 2+ scope.
--
-- Purely additive: does not alter, drop, or touch any existing table
-- or row from 0001_init.sql.
-- ================================================================

CREATE TABLE IF NOT EXISTS connections (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_id        TEXT NOT NULL,              -- references a ConnectorDefinition.id in code, not a DB FK — the registry is the source of truth for which ids are valid
  status              TEXT NOT NULL DEFAULT 'not_connected', -- not_connected | connecting | connected | error | revoked | disconnected
  auth_type           TEXT NOT NULL,               -- none | api_key | oauth2 | service_account | mcp
  external_account_id TEXT,                        -- the external system's own id for what got connected — never a secret
  display_name        TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}', -- non-secret facts only — enforced at the API layer, not just by convention here
  credential_ref       TEXT,                        -- opaque pointer to a future secret store — never a token itself, unused in Phase 1
  error_reason        TEXT,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL,
  created_by          TEXT REFERENCES users(id),
  updated_by          TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_connections_org ON connections(org_id);
CREATE INDEX IF NOT EXISTS idx_connections_org_connector ON connections(org_id, connector_id);

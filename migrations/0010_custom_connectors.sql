-- ================================================================
-- 0010_custom_connectors.sql — the one real extension that makes
-- connectors org-addable instead of 100% static code (section 4/11/
-- 14 of the connectivity platform brief: MCP servers and Custom REST
-- Connectors). A ConnectorDefinition itself stays code — this table
-- holds the per-organization, mutable CONFIGURATION a dynamic
-- connector needs (endpoint/base URL, discovered tool cache, one
-- encrypted credential blob) — lib/connectors/dynamic.ts turns each
-- row into an ordinary ConnectorDefinition at request time, so
-- nothing downstream (Tool Registry, tool-runner, Studio) needs to
-- know a connector is dynamic vs. static.
--
-- `credential_encrypted`: one AES-256-GCM-encrypted JSON blob (same
-- lib/crypto/secret-box.ts primitive oauth_credentials already uses),
-- holding whichever shape this connector's authType needs
-- ({"type":"api_key","value":...} / {"type":"bearer","token":...} /
-- {"type":"basic","username":...,"password":...} / {"type":"mcp_bearer",
-- "token":...}) — never plaintext, never returned by any API response.
-- A single flexible column rather than a second oauth_credentials-
-- shaped table, since a custom connector never needs OAuth2 refresh
-- semantics (that's connections/oauth_credentials' job already).
--
-- Purely additive: does not alter any existing table.
-- ================================================================

CREATE TABLE IF NOT EXISTS custom_connectors (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,               -- 'mcp' | 'rest'
  name                  TEXT NOT NULL,
  description           TEXT,
  config                JSONB NOT NULL DEFAULT '{}', -- kind-specific real, non-secret config: mcp={endpointUrl}; rest={baseUrl, authType, headerTemplate}
  credential_encrypted  TEXT,                        -- see header — never plaintext
  discovered_tools      JSONB NOT NULL DEFAULT '[]', -- real cached tool/action descriptors from the last successful discovery/import
  status                TEXT NOT NULL DEFAULT 'not_connected', -- not_connected | connected | error
  error_reason          TEXT,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  created_by            TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_custom_connectors_org ON custom_connectors(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_connectors_org_name ON custom_connectors(org_id, name);

-- ================================================================
-- 0012_custom_connector_credentials.sql — connector platform audit,
-- Fase D2: separates the CREDENTIAL from the connector DEFINITION.
--
-- custom_connectors.credential_encrypted (0010_custom_connectors.sql)
-- remains in place and remains what lib/connectors/custom-rest.ts and
-- mcp-client.ts actually resolve at call time in this phase — this
-- migration is additive infrastructure, not a cutover. It exists so
-- an organization can hold more than one credential per Custom
-- Connector (e.g. "Acme ERP — Production" and "Acme ERP — Staging"),
-- each a real, separately encrypted, separately labeled row — the
-- exact gap the audit named: "hoje um Custom Connector só pode ter
-- UMA credencial implícita."
--
-- Same AES-256-GCM primitive (lib/crypto/secret-box.ts) every other
-- credential in this system already uses — one row, one secret,
-- never plaintext, never returned by any API response.
--
-- The CONNECTION side of this separation needs no new table at all:
-- connections.connector_id (0002_connectors.sql) is already a free
-- TEXT column, not a foreign key into the static registry — a
-- "custom_<id>"-prefixed connector_id already lets N connections rows
-- exist per custom connector today, with no schema change (see
-- lib/connectors/custom-connector-id.ts's customConnectorConnectorId()
-- for the one place that prefix is generated).
--
-- Purely additive: does not alter, drop, or touch any existing table.
-- ================================================================

CREATE TABLE IF NOT EXISTS custom_connector_credentials (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  custom_connector_id   TEXT NOT NULL REFERENCES custom_connectors(id) ON DELETE CASCADE,
  label                 TEXT NOT NULL DEFAULT 'Default',
  credential_encrypted  TEXT NOT NULL,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  created_by            TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_custom_connector_credentials_org ON custom_connector_credentials(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_connector_credentials_connector ON custom_connector_credentials(custom_connector_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_connector_credentials_connector_label ON custom_connector_credentials(custom_connector_id, label);

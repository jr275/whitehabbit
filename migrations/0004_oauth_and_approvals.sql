-- ================================================================
-- 0004_oauth_and_approvals.sql — real OAuth2 credential storage +
-- real Human-in-the-Loop approval persistence.
--
-- Two new tables, both genuinely new state that didn't exist before:
--
-- oauth_credentials: connections.credential_ref (0002_connectors.sql)
-- was explicitly documented as "an opaque pointer to a future secret
-- store" — this is that store. One row per Connection, holding
-- AES-256-GCM-encrypted access/refresh tokens (lib/crypto/secret-
-- box.ts) — never plaintext, never exposed to the browser, never
-- returned by any API response. A Connection with no matching row
-- here has no usable credential, full stop.
--
-- approvals: the real Human-in-the-Loop queue. A row is created the
-- instant runToolAction() throws ApprovalRequiredError (before any
-- external call happens) and captures exactly what would have run
-- (action_id + real input) so a human's later Approve decision can
-- execute that real, specific call — never a re-guessed one.
--
-- Purely additive: does not alter, drop, or touch any table from
-- 0001/0002/0003. Idempotent (IF NOT EXISTS throughout).
-- ================================================================

CREATE TABLE IF NOT EXISTS oauth_credentials (
  id                      TEXT PRIMARY KEY,
  connection_id           TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  access_token_encrypted  TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_type              TEXT,
  scope                   TEXT,
  expires_at              BIGINT,
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_credentials_connection ON oauth_credentials(connection_id);

CREATE TABLE IF NOT EXISTS approvals (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id    TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  execution_id TEXT REFERENCES executions(id),
  tool_id      TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  action_id    TEXT NOT NULL,
  action_label TEXT NOT NULL,
  permission   TEXT NOT NULL,
  reason       TEXT NOT NULL,
  input        JSONB NOT NULL DEFAULT '{}', -- the real input the blocked call would have used — replayed verbatim on Approve
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  result       JSONB, -- the real ToolActionResult once Approve actually runs the action
  requested_at BIGINT NOT NULL,
  decided_at   BIGINT,
  decided_by   TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_approvals_org_status ON approvals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_worker ON approvals(worker_id);

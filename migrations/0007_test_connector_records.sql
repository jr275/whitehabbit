-- ================================================================
-- 0007_test_connector_records.sql — a real, internal table the
-- Internal Test Connector's one write action ("record") actually
-- writes to. This is what lets the runtime-hardening test suite and
-- a live Playwright pass genuinely exercise the real approval/resume/
-- idempotency/lease mechanisms end to end (WAITING_FOR_APPROVAL ->
-- Approve -> resume -> real write -> Slack-equivalent notify ->
-- COMPLETED) without a real Salesforce/Slack account — this
-- connector is explicitly internal-only (see lib/connectors/test-
-- connector.ts's own header) and its records are never presented as
-- a real business result anywhere in the product.
--
-- Purely additive. Idempotent (IF NOT EXISTS).
-- ================================================================

CREATE TABLE IF NOT EXISTS test_connector_records (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  execution_id TEXT REFERENCES executions(id) ON DELETE CASCADE,
  note         TEXT NOT NULL,
  created_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_test_connector_records_org ON test_connector_records(org_id);

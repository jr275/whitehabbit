-- ================================================================
-- 0008_observatory_indexes.sql — supports the real Observatory's
-- query patterns: org-scoped recent-execution lists ordered by
-- start time, org-scoped status filtering, per-execution output/
-- approval lookups, and org-scoped recent-activity feeds.
--
-- Purely additive (IF NOT EXISTS throughout) — no table changes.
-- ================================================================

-- Observatory's "recent executions" list: WHERE org_id = $1 [AND
-- status = $2] ORDER BY started_at DESC LIMIT/OFFSET.
CREATE INDEX IF NOT EXISTS idx_executions_org_started ON executions(org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_org_status ON executions(org_id, status);

-- Per-execution output count / approval-state join in the recent
-- executions list (previously unindexed on outputs, and only
-- indexed by worker on approvals).
CREATE INDEX IF NOT EXISTS idx_outputs_execution ON outputs(execution_id);
CREATE INDEX IF NOT EXISTS idx_approvals_execution ON approvals(execution_id);

-- Observatory's real activity feed: WHERE org_id = $1 AND type = ANY(...)
-- ORDER BY "timestamp" DESC LIMIT $n.
CREATE INDEX IF NOT EXISTS idx_execevents_org_timestamp ON execution_events(org_id, "timestamp" DESC);

-- ================================================================
-- 0005_pipeline_state.sql — real, resumable multi-stage execution
-- state + a real idempotency ledger for external actions.
--
-- executions.pipeline_state: an ordered array of real stage records
-- (research/qualification/llm_scoring/decision/salesforce_action/
-- slack_notify — see lib/agent/pipeline/types.ts) for skills that run
-- as a named, resumable pipeline rather than one opaque execute()
-- call. NULL for every other skill — this is additive, not a
-- replacement for the existing execution_events log, which still
-- records every real event for every skill.
--
-- approvals.resume_state + approvals.skill_id: what a resumable
-- skill's Approve decision needs to CONTINUE the same execution past
-- the approved action (e.g. reach the Slack step after a Salesforce
-- update is approved) instead of only running the one captured
-- action in isolation (the prior phase's honestly-scoped behavior,
-- preserved as the fallback when a skill has no resumeState).
--
-- action_executions: the real idempotency ledger for section 16 — a
-- real, retried Salesforce update or Slack notification is looked up
-- here by idempotency_key before it is ever attempted again, so a
-- retry can never double-perform a real external write.
--
-- Purely additive: does not alter, drop, or touch any existing
-- column, table, or row. Idempotent (IF NOT EXISTS throughout).
-- ================================================================

ALTER TABLE executions ADD COLUMN IF NOT EXISTS pipeline_state JSONB;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS resume_state JSONB;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS skill_id TEXT;

CREATE TABLE IF NOT EXISTS action_executions (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  execution_id    TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL, -- e.g. "salesforce", "slack"
  action          TEXT NOT NULL, -- e.g. "update_lead", "send_message"
  resource        TEXT,          -- the real external resource this action targets (a Lead id, a channel), when known
  idempotency_key TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
  result          JSONB,
  created_at      BIGINT NOT NULL,
  completed_at    BIGINT
);
-- Globally unique on idempotency_key alone: the key string already
-- embeds the execution id (see lib/agent/pipeline/idempotency.ts), so
-- two different executions can never collide by construction — a
-- simpler and equally correct guarantee than scoping by org_id too.
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_executions_idempotency ON action_executions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_action_executions_execution ON action_executions(execution_id);

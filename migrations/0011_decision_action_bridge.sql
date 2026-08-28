-- ================================================================== --
-- PHASE 7 — DECISION -> ACTION BRIDGE (ADR-038/039). Closes R-37: an
-- approved IntelligenceDecision did not yet automatically create and
-- execute a real Action. This migration:
--
--   1. Adds a real 'blocked' status to intelligence_actions — distinct
--      from 'failed' (something was attempted and errored): 'blocked'
--      means the ActionExecutor's PolicyEngine or the
--      DecisionActionResolver itself determined, before any real
--      execution was attempted, that this action cannot run yet (an
--      unsupported action type, a missing capability, a stale
--      decision) — never silently succeeds, never conflated with a
--      genuine runtime failure.
--   2. Adds retry_of_action_id — real lineage from a retried action
--      back to the one it retried (POST /actions/:id/retry creates a
--      NEW row rather than mutating the terminal one, preserving the
--      full real history).
--   3. A real, DB-enforced idempotency guard: at most one
--      queued/running/succeeded/blocked action per real Decision —
--      concurrent or duplicate POST /decisions/:id/execute calls race
--      on this constraint exactly the way agent_runs' own
--      idempotency_key unique index already does (migrations/0004),
--      never creating two active executions for the same Decision.
--      'failed'/'cancelled' rows are deliberately excluded so a real
--      retry can still create a fresh action.
-- ================================================================== --

ALTER TABLE intelligence_actions DROP CONSTRAINT IF EXISTS intelligence_actions_status_check;
ALTER TABLE intelligence_actions ADD CONSTRAINT intelligence_actions_status_check
  CHECK (status IN ('queued','running','succeeded','failed','cancelled','blocked'));

ALTER TABLE intelligence_actions ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE intelligence_actions ADD COLUMN IF NOT EXISTS retry_of_action_id TEXT REFERENCES intelligence_actions(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_actions_decision_active
  ON intelligence_actions(decision_id)
  WHERE status IN ('queued', 'running', 'succeeded', 'blocked');

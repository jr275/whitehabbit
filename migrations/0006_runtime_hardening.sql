-- ================================================================
-- 0006_runtime_hardening.sql — production-grade execution runtime:
-- concurrency control, event idempotency, and a fuller action-
-- execution record.
--
-- execution_leases: a real lease/lock so two workers/processes can
-- never resume or retry the same execution concurrently. Acquired
-- before resumeTask()/retryFailedStage() runs, released (or left to
-- expire) after. lease_until is a real timestamp, not a boolean —
-- a crashed holder's lease expires on its own rather than
-- permanently wedging the execution.
--
-- execution_events.idempotency_key: a deterministic key so the exact
-- same logical event (same execution, same type, same stage, same
-- attempt) can never be inserted twice — defense in depth alongside
-- the lease, for the case a stage's own code path is re-entered.
-- Partial unique index (NULL-safe) since not every event type is
-- stage-scoped.
--
-- action_executions: adds the fields section 6 names explicitly —
-- step_id, integration_id, attempt, error_code, error_message —
-- rather than leaving them folded only inside the `result` JSONB.
--
-- Purely additive. Idempotent (IF NOT EXISTS throughout).
-- ================================================================

CREATE TABLE IF NOT EXISTS execution_leases (
  execution_id TEXT PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
  lease_owner  TEXT NOT NULL,
  lease_until  BIGINT NOT NULL,
  acquired_at  BIGINT NOT NULL
);

ALTER TABLE execution_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_execevents_idempotency ON execution_events(execution_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE action_executions ADD COLUMN IF NOT EXISTS step_id TEXT;
ALTER TABLE action_executions ADD COLUMN IF NOT EXISTS integration_id TEXT;
ALTER TABLE action_executions ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE action_executions ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE action_executions ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Approval decisions are made idempotent by an atomic
-- UPDATE ... WHERE status = 'pending' in decideApproval() — a real
-- compare-and-swap needs no extra table, just the right WHERE clause
-- (see lib/db/repo.ts).

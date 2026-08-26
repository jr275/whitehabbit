-- ================================================================== --
-- STEP-LEVEL DURABLE JOBS (Phase 5A, ADR-023) — extends the existing
-- `jobs` table rather than introducing a parallel WorkflowStepJob
-- table: a step job IS a job (same queue, same dequeue/priority/
-- concurrency/dead-letter mechanics), just one that additionally names
-- which single workflow step it dispatches. See ADR-023 for the full
-- decision record.
-- ================================================================== --

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS step_name TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS step_sequence INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_expires_at BIGINT; -- set at dequeue; a locked job whose lease has expired is a crashed/stuck worker, real recovery target
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at BIGINT;

-- a crashed-worker sweep (lib/workflow/queue.ts#reapExpiredLeases) scans
-- exactly this shape: locked jobs whose lease has expired.
CREATE INDEX IF NOT EXISTS idx_jobs_lease ON jobs(status, lease_expires_at) WHERE status = 'locked';
CREATE INDEX IF NOT EXISTS idx_jobs_workflow_run ON jobs(workflow_run_id) WHERE workflow_run_id IS NOT NULL;

-- ---- project-level budget override (§6) -------------------------------
-- Resolution order used by lib/workflow/budget-policy.ts:
--   explicit workflow-start override -> project_budgets -> tenant_budgets
--   -> DEFAULT_BUDGET (lib/workflow/budget.ts). A project with no row
-- here simply falls through to the tenant default — never a fabricated
-- "0 budget" or an error.
CREATE TABLE IF NOT EXISTS project_budgets (
  project_id                TEXT PRIMARY KEY REFERENCES projects(id),
  org_id                    TEXT NOT NULL REFERENCES organizations(id),
  max_tokens                INTEGER,
  max_cost_usd              DOUBLE PRECISION,
  max_duration_ms           INTEGER,
  max_steps                 INTEGER,
  max_concurrent_discovery  INTEGER,
  max_concurrent_generation INTEGER,
  updated_at                BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_budgets_org ON project_budgets(org_id);

-- ================================================================
-- 0004_durable_workflows.sql — Phase 4: durable, resumable, retried,
-- tenant-concurrency-aware workflow execution; domain management;
-- route templates. See docs/architecture/phase-4-plan.md, ADR-017..022.
--
-- Extends the Phase-3 agent_runs/agent_run_steps tables in place
-- (same physical tables, wider state machine + new columns) rather
-- than introducing a parallel ledger — see ADR-017.
-- ================================================================

-- ---- agent_runs: the WorkflowRun state machine (ADR-017) -----------
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
-- widen the check to the full 10-state canonical machine
-- (queued|running|waiting|paused|waiting_approval|retrying|succeeded|failed|cancelled|timed_out).
-- Existing rows used 'completed'/'blocked'/'pending_approval' (Phase 3) —
-- normalize them to the new vocabulary before the new constraint is added,
-- so old rows remain queryable/valid rather than orphaned.
UPDATE agent_runs SET status = 'succeeded' WHERE status = 'completed';
UPDATE agent_runs SET status = 'failed' WHERE status = 'blocked';
UPDATE agent_runs SET status = 'waiting_approval' WHERE status = 'pending_approval';
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('queued','running','waiting','paused','waiting_approval','retrying','succeeded','failed','cancelled','timed_out'));

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS available_at BIGINT; -- when a RETRYING run may next be attempted
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('critical','high','normal','low','background'));
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS budget JSONB; -- {maxTokens, maxCostUsd, maxDurationMs, maxSteps}
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS usage JSONB;  -- real, accumulated {tokens, costUsd, durationMs, steps}
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS checkpoint JSONB; -- {lastCompletedStep, lastCompletedSequence}
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS trace_id TEXT;
-- At most one ACTIVE (non-terminal) workflow per (tenant, workflow type,
-- real-world subject) — a second start attempt while one is already
-- in flight returns the existing run rather than creating a duplicate.
-- A REAL, Postgres-maintained partial unique index, not just app logic
-- (§6) — rows fall out of the index the moment status reaches a terminal
-- state, so a deliberate later re-run (e.g. re-crawl after 'succeeded')
-- is a genuinely new row, never blocked by a stale key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_runs_active_idempotency
  ON agent_runs(idempotency_key) WHERE status NOT IN ('succeeded','failed','cancelled');
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_available_at ON agent_runs(available_at) WHERE status = 'retrying';

-- ---- agent_run_steps: the WorkflowStep state machine ---------------
ALTER TABLE agent_run_steps DROP CONSTRAINT IF EXISTS agent_run_steps_status_check;
UPDATE agent_run_steps SET status = 'succeeded' WHERE status = 'completed';
ALTER TABLE agent_run_steps ADD CONSTRAINT agent_run_steps_status_check
  CHECK (status IN ('queued','running','succeeded','failed','skipped','retrying'));
ALTER TABLE agent_run_steps ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_run_steps ADD COLUMN IF NOT EXISTS checkpoint_data JSONB; -- small, real, resumable output — the actual checkpoint a resume reads back

-- ---- jobs: the work queue (§7) --------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  workflow_run_id  TEXT REFERENCES agent_runs(id),
  type             TEXT NOT NULL, -- matches agent_runs.pipeline
  priority         TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low','background')),
  payload          JSONB NOT NULL,
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 3,
  available_at     BIGINT NOT NULL, -- due time — supports both immediate and scheduled jobs
  locked_at        BIGINT,
  locked_by        TEXT, -- worker instance id, for visibility only — SKIP LOCKED is the real safety mechanism
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','locked','completed','failed','dead_letter','cancelled')),
  idempotency_key  TEXT,
  error            TEXT,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
-- same active-only dedupe pattern as agent_runs above
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_active_idempotency ON jobs(idempotency_key) WHERE status IN ('pending','locked');
CREATE INDEX IF NOT EXISTS idx_jobs_dequeue ON jobs(status, available_at, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_org ON jobs(org_id);

-- ---- approvals: durable human-in-the-loop (§12) ---------------------
CREATE TABLE IF NOT EXISTS approvals (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id),
  project_id         TEXT NOT NULL REFERENCES projects(id),
  workflow_run_id    TEXT NOT NULL REFERENCES agent_runs(id),
  artifact_type      TEXT NOT NULL, -- e.g. 'page', 'opportunity'
  artifact_id        TEXT NOT NULL,
  requested_by_agent TEXT NOT NULL, -- e.g. 'PublisherAgent'
  approval_type      TEXT NOT NULL, -- e.g. 'publish'
  risk_level         TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  reviewer           TEXT REFERENCES users(id),
  decision_reason    TEXT,
  created_at         BIGINT NOT NULL,
  expires_at         BIGINT,
  resolved_at        BIGINT
);
CREATE INDEX IF NOT EXISTS idx_approvals_org_status ON approvals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_workflow ON approvals(workflow_run_id);

-- ---- tenant_budgets: real, configurable per-tenant AI cost limits ---
CREATE TABLE IF NOT EXISTS tenant_budgets (
  org_id                 TEXT PRIMARY KEY REFERENCES organizations(id),
  daily_cost_limit_usd   DOUBLE PRECISION,
  monthly_cost_limit_usd DOUBLE PRECISION,
  max_concurrent_discovery INTEGER NOT NULL DEFAULT 3,
  max_concurrent_generation INTEGER NOT NULL DEFAULT 5,
  updated_at             BIGINT NOT NULL
);

-- ---- domains (ADR-010, ADR-018) --------------------------------------
CREATE TABLE IF NOT EXISTS domains (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id),
  project_id         TEXT NOT NULL REFERENCES projects(id),
  hostname           TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('subdomain','custom')),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','failed','expired')),
  verification_method TEXT CHECK (verification_method IN ('dns_txt','dns_cname')),
  verification_token TEXT NOT NULL, -- real random token the tenant must publish — never guessed, never assumed
  is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         BIGINT NOT NULL,
  verified_at        BIGINT,
  UNIQUE (hostname)
);
CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_id);
CREATE INDEX IF NOT EXISTS idx_domains_hostname_verified ON domains(hostname) WHERE verification_status = 'verified';

CREATE TABLE IF NOT EXISTS domain_verifications (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  domain_id    TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  method       TEXT NOT NULL CHECK (method IN ('dns_txt','dns_cname')),
  result       TEXT NOT NULL CHECK (result IN ('success','failure')),
  detail       TEXT, -- the real observed DNS value, or the real error — never fabricated
  checked_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domain_verifications_domain ON domain_verifications(domain_id);

-- ---- route_templates (§19) -------------------------------------------
CREATE TABLE IF NOT EXISTS route_templates (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  name             TEXT NOT NULL,
  pattern          TEXT NOT NULL, -- e.g. "/{city}/{propertyType}/{intent}"
  version          INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  entity_bindings  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{segment, entityType}]
  intent_bindings  JSONB NOT NULL DEFAULT '[]'::jsonb,
  market_bindings  JSONB NOT NULL DEFAULT '[]'::jsonb,
  requirements     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- real preconditions checked before binding a page to this template
  priority         INTEGER NOT NULL DEFAULT 0,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL,
  UNIQUE (project_id, name, version)
);
CREATE INDEX IF NOT EXISTS idx_route_templates_project ON route_templates(project_id);

-- ---- per-project autonomy policy (§13) -------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS autonomy_level TEXT NOT NULL DEFAULT 'LEVEL_1'
  CHECK (autonomy_level IN ('LEVEL_0','LEVEL_1','LEVEL_2','LEVEL_3','LEVEL_4'));

-- lookup used by the content-generation orchestrator to check "has a
-- human already decided this exact publish approval" on resume, without
-- scanning every approval for the org.
CREATE INDEX IF NOT EXISTS idx_approvals_artifact ON approvals(org_id, artifact_type, artifact_id, approval_type);

-- pages gets an optional route_template_id (page_template_id already
-- existed as a reserved column — see ADR-016 — this is the real FK now
-- that RouteTemplate exists) and a domain_id once it's served from a
-- verified domain rather than the fallback /sites/:projectId/:slug path.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS route_template_id TEXT REFERENCES route_templates(id);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS domain_id TEXT REFERENCES domains(id);

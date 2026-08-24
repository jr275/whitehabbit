-- ================================================================
-- 0001_init.sql — production PostgreSQL schema.
--
-- Replaces the SQLite schema (lib/db/schema.ts, kept only as
-- historical reference for local-dev fallback) with the real
-- multi-tenant, versioned, durable-execution schema.
--
-- Timestamps are BIGINT epoch-milliseconds throughout, matching the
-- existing TypeScript model (Worker.createdAt: number, etc.) exactly
-- — no client/selector code needs to change its date handling.
-- IDs stay prefixed TEXT ("worker_...", "exec_...") to match the
-- existing ID format already produced by application code.
-- ================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- ---- auth: users + org membership -------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner', -- owner | member
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id);

-- ---- workers: the durable, org-scoped entity ---------------------
-- `definition` holds the full draft WorkerDefinition JSON (identity/
-- mission/skills/tools/behaviors/channels/outcome) — a pragmatic
-- hybrid: relational columns for what must be queried/filtered/
-- authorized on, JSONB for the still-evolving Builder shape.
CREATE TABLE IF NOT EXISTS workers (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id),
  name                TEXT NOT NULL,
  definition          JSONB NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft', -- draft | building | ready | live
  tested              BOOLEAN NOT NULL DEFAULT FALSE,
  released_version_id TEXT, -- FK to worker_versions, added after that table exists
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL,
  released_at         BIGINT,
  created_by          TEXT REFERENCES users(id),
  updated_by          TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_workers_org ON workers(org_id);

-- ---- worker_versions: immutable Build artifacts ------------------
-- A Build snapshots the draft definition into an immutable row with
-- a content fingerprint. Release promotes exactly one version's id
-- into workers.released_version_id — that is the ONLY definition of
-- "live"; nothing infers it from worker.status.
CREATE TABLE IF NOT EXISTS worker_versions (
  id             TEXT PRIMARY KEY,
  worker_id      TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  version_number INTEGER NOT NULL,
  definition     JSONB NOT NULL,   -- frozen copy of the Worker definition at build time
  fingerprint    TEXT NOT NULL,    -- sha256 of the normalized definition — reproducibility check
  status         TEXT NOT NULL DEFAULT 'ready', -- ready | released | archived
  created_at     BIGINT NOT NULL,
  released_at    BIGINT,
  UNIQUE (worker_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_worker_versions_worker ON worker_versions(worker_id);

ALTER TABLE workers
  ADD CONSTRAINT fk_workers_released_version
  FOREIGN KEY (released_version_id) REFERENCES worker_versions(id);

-- ---- runtime ledger -----------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id),
  worker_id  TEXT NOT NULL REFERENCES workers(id),
  skill_id   TEXT NOT NULL,
  category   TEXT NOT NULL,
  title      TEXT NOT NULL,
  input      JSONB,
  status     TEXT NOT NULL, -- queued | running | completed | failed | blocked | pending_approval
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_worker ON tasks(worker_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(org_id);

-- Durable Execution entity — references the exact WorkerVersion that
-- ran, so a later draft edit can never change what a past (or a
-- currently in-flight) execution is understood to have run.
CREATE TABLE IF NOT EXISTS executions (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id),
  worker_id         TEXT NOT NULL REFERENCES workers(id),
  worker_version_id TEXT REFERENCES worker_versions(id),
  task_id           TEXT NOT NULL REFERENCES tasks(id),
  status            TEXT NOT NULL, -- queued | running | completed | failed | blocked | pending_approval | cancelled
  reason_code       TEXT,
  blocked_reason    TEXT,
  started_at        BIGINT NOT NULL,
  completed_at      BIGINT,
  duration_ms       INTEGER,
  cost_usd          DOUBLE PRECISION,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  model             TEXT,
  execution_mode    TEXT -- NULL = real production execution; "development" = LLM_DEV_MODE fixture
);
CREATE INDEX IF NOT EXISTS idx_executions_worker ON executions(worker_id);
CREATE INDEX IF NOT EXISTS idx_executions_org ON executions(org_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);

-- Persisted, sequenced execution events — the durable source of
-- truth for the timeline; the live NDJSON stream is a transport for
-- still-connected browsers, not the record of what happened.
CREATE TABLE IF NOT EXISTS execution_events (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  worker_id    TEXT NOT NULL REFERENCES workers(id),
  task_id      TEXT NOT NULL,
  sequence     INTEGER NOT NULL,
  type         TEXT NOT NULL,
  payload      JSONB NOT NULL,
  "timestamp"  BIGINT NOT NULL,
  UNIQUE (execution_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_execevents_execution ON execution_events(execution_id);

CREATE TABLE IF NOT EXISTS outputs (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  worker_id     TEXT NOT NULL REFERENCES workers(id),
  task_id       TEXT NOT NULL REFERENCES tasks(id),
  execution_id  TEXT NOT NULL REFERENCES executions(id),
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       JSONB NOT NULL, -- { content: string, structured?: unknown }
  sources       JSONB,
  quality_score DOUBLE PRECISION,
  evaluation    JSONB,          -- { qualityScore, breakdown: [...] } — STRUCTURAL evaluation only; see lib/agent — never presented as human/model evaluation
  status        TEXT NOT NULL,
  created_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outputs_worker ON outputs(worker_id);
CREATE INDEX IF NOT EXISTS idx_outputs_org ON outputs(org_id);

CREATE TABLE IF NOT EXISTS business_events (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  worker_id   TEXT NOT NULL REFERENCES workers(id),
  output_id   TEXT REFERENCES outputs(id),
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  occurred_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bizevents_worker ON business_events(worker_id);

CREATE TABLE IF NOT EXISTS metrics (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id),
  worker_id         TEXT NOT NULL REFERENCES workers(id),
  execution_id      TEXT REFERENCES executions(id),
  business_event_id TEXT REFERENCES business_events(id),
  key               TEXT NOT NULL,
  kind              TEXT NOT NULL, -- operational | quality | cost | business
  value             DOUBLE PRECISION NOT NULL,
  unit              TEXT,
  recorded_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metrics_worker ON metrics(worker_id);

-- ---- rate limiting: distributed, Postgres-backed -----------------
-- A fixed-window counter keyed by (scope, org/user, window bucket).
-- Correct across concurrent serverless instances because Postgres
-- (not process memory) is the single source of truth; avoids adding
-- a new third-party dependency (e.g. Upstash) for this scale.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket_key   TEXT PRIMARY KEY, -- e.g. "worker_create:org_xxx:172834"
  count        INTEGER NOT NULL DEFAULT 0,
  window_start BIGINT NOT NULL,
  expires_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ratelimit_expires ON rate_limit_counters(expires_at);

-- ---- audit log ----------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  org_id        TEXT REFERENCES organizations(id),
  user_id       TEXT REFERENCES users(id),
  action        TEXT NOT NULL, -- worker.create | worker.build | worker.release | execution.run | ...
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  metadata      JSONB,
  created_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id);

/* ================================================================== *
 * DATABASE SCHEMA — the real, minimum-viable persistence layer.
 *
 * SQLite via node:sqlite (Node 22+, zero extra dependency). Every row
 * here is written by real application code, never by a UI mock.
 *
 * Worker DEFINITIONS (identity/mission/skills/tools/behavior/channels/
 * outcome) are stored as a JSON document per worker — the shape is
 * still evolving alongside the Studio Builder and normalizing it fully
 * buys little at this stage. The RUNTIME ledger (tasks, executions,
 * events, outputs, business_events, metrics) is fully relational,
 * because that ledger is the product's source of truth for "what
 * actually happened" and needs to be queried, filtered and joined.
 *
 * organizations exist so the schema is not single-tenant by accident —
 * every worker belongs to one. No auth is implemented; a single
 * default org is seeded and used until real auth exists.
 * ================================================================== */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  definition TEXT NOT NULL,      -- JSON: WorkerDefinition (identity/mission/skills/tools/behaviors/channels/outcome/status)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  skill_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  input TEXT,                    -- JSON: the real input the task ran with
  status TEXT NOT NULL,          -- queued | running | completed | failed | blocked
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  status TEXT NOT NULL,          -- running | completed | failed | blocked
  blocked_reason TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER,
  cost_usd REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  execution_id TEXT NOT NULL REFERENCES executions(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL,            -- task_started | tool_called | tool_completed | reasoning_started | skill_started | output_created | metric_recorded | task_completed | task_failed | task_blocked
  payload TEXT NOT NULL,         -- JSON
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outputs (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  execution_id TEXT NOT NULL REFERENCES executions(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,         -- JSON: structured result
  sources TEXT,                  -- JSON: real source records used (url, title, provider)
  quality_score REAL,
  evaluation TEXT,                -- JSON: the real evaluator breakdown that produced quality_score
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS business_events (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  output_id TEXT REFERENCES outputs(id),
  type TEXT NOT NULL,            -- e.g. content_published, lead_captured
  payload TEXT NOT NULL,         -- JSON
  occurred_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  execution_id TEXT REFERENCES executions(id),
  business_event_id TEXT REFERENCES business_events(id),
  key TEXT NOT NULL,             -- e.g. sources_analyzed, trends_identified, revenue_usd
  kind TEXT NOT NULL,            -- operational | quality | cost | business
  value REAL NOT NULL,
  unit TEXT,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_worker ON tasks(worker_id);
CREATE INDEX IF NOT EXISTS idx_executions_worker ON executions(worker_id);
CREATE INDEX IF NOT EXISTS idx_events_execution ON events(execution_id);
CREATE INDEX IF NOT EXISTS idx_outputs_worker ON outputs(worker_id);
CREATE INDEX IF NOT EXISTS idx_metrics_worker ON metrics(worker_id);
`

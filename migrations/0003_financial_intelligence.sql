-- ================================================================
-- 0003_financial_intelligence.sql — Phase 3: Financial Intelligence
-- Engine. Two new org-scoped tables for the Opportunity/Decision
-- Engines' output — kept separate from `outputs` (the generic per-
-- execution artifact table) because Opportunities/Decisions have
-- their own lifecycle (status transitions independent of the
-- execution that first detected them) and are queried directly by
-- /opportunities and /decisions, not just displayed inline with one
-- execution's result.
--
-- Both tables store their rich structured shape (evidence/
-- assumptions/economics/scenario/action) as JSONB — the same
-- pragmatic hybrid `workers.definition` already uses — with real
-- relational columns for what must be filtered/authorized on
-- (org_id, worker_id, status, category).
-- ================================================================

CREATE TABLE IF NOT EXISTS opportunities (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  worker_id      TEXT NOT NULL REFERENCES workers(id),
  execution_id   TEXT REFERENCES executions(id),
  category       TEXT NOT NULL,
  status         TEXT NOT NULL, -- DETECTED | ANALYZING | READY | ACCEPTED | REJECTED | EXPIRED | EXECUTED | VERIFIED
  expected_value DOUBLE PRECISION NOT NULL,
  priority_value DOUBLE PRECISION NOT NULL,
  currency       TEXT NOT NULL,
  data           JSONB NOT NULL, -- the full Opportunity object (lib/finance/types.ts)
  created_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities(org_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_worker ON opportunities(worker_id);

CREATE TABLE IF NOT EXISTS decisions (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  worker_id        TEXT NOT NULL REFERENCES workers(id),
  execution_id     TEXT REFERENCES executions(id),
  opportunity_id   TEXT REFERENCES opportunities(id),
  status           TEXT NOT NULL, -- DETECTED | READY | PREPARED
  policy_status    TEXT NOT NULL, -- ALLOWED | APPROVAL_REQUIRED | BLOCKED
  approval_status  TEXT NOT NULL, -- NOT_REQUIRED | REQUIRED | BLOCKED
  annual_benefit   DOUBLE PRECISION NOT NULL,
  currency         TEXT NOT NULL,
  data             JSONB NOT NULL, -- the full Decision object (lib/finance/types.ts)
  created_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_org ON decisions(org_id);
CREATE INDEX IF NOT EXISTS idx_decisions_worker ON decisions(worker_id);

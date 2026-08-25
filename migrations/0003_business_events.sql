-- ================================================================
-- 0003_business_events.sql — Business Event / Business Metric
-- provenance columns (Business Impact foundation).
--
-- WHY: business_events and metrics already existed (0001_init.sql) —
-- the relational shape (metrics.business_event_id -> business_events,
-- both worker/org-scoped) was already correct. What was missing was
-- (a) business_events was never actually written by the runtime, and
-- (b) neither table could express WHAT was attributed (a specific
-- account, a numeric value, a currency, a confidence, a real source
-- label) — only a free-form JSONB payload, which can't be queried/
-- aggregated the way a "click a metric, see its evidence" provenance
-- chain requires (section 4/13 of the Business Impact brief).
--
-- Purely additive: every column is nullable, added with
-- ADD COLUMN IF NOT EXISTS — safe to run against the existing
-- populated production database, does not alter or drop anything
-- from 0001_init.sql or 0002_connectors.sql, idempotent (safe to
-- run twice).
-- ================================================================

ALTER TABLE business_events ADD COLUMN IF NOT EXISTS execution_id TEXT REFERENCES executions(id);
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS numeric_value DOUBLE PRECISION;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;
-- Real provenance label, e.g. "skill:skill_lead_qualification" today;
-- "connector:google" once a Connection (lib/connectors/) can emit a
-- real business event — never a fabricated integration name.
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_bizevents_org_type ON business_events(org_id, type);
CREATE INDEX IF NOT EXISTS idx_bizevents_execution ON business_events(execution_id);

ALTER TABLE metrics ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_metrics_org_key ON metrics(org_id, key);

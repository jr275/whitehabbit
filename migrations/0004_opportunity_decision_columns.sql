-- ================================================================
-- 0004_opportunity_decision_columns.sql — Phase 4: promote the fields
-- that need real structured querying (§3/§4 of the "connect the
-- engine" brief) out of the `data` JSONB blob and into real columns.
-- Purely additive — every new column is nullable or backfillable from
-- existing rows' own JSONB, so no data is lost for rows written by
-- migration 0003.
-- ================================================================

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS entity_id       TEXT,
  ADD COLUMN IF NOT EXISTS skill_id        TEXT,
  ADD COLUMN IF NOT EXISTS data_provenance TEXT,
  ADD COLUMN IF NOT EXISTS economic_state  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      BIGINT;

-- Backfill from the JSONB payload already stored for any row inserted
-- before this migration ran — never leaves an old row's new columns
-- NULL when the real value already exists in `data`.
UPDATE opportunities SET
  entity_id       = COALESCE(entity_id, data->>'entityId'),
  skill_id        = COALESCE(skill_id, data->>'skillId'),
  data_provenance = COALESCE(data_provenance, data->>'dataProvenance', 'demo'),
  economic_state  = COALESCE(economic_state, data->>'economicState', 'estimated'),
  updated_at      = COALESCE(updated_at, created_at)
WHERE entity_id IS NULL OR skill_id IS NULL OR data_provenance IS NULL OR economic_state IS NULL OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_entity ON opportunities(entity_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON opportunities(created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_expected_value ON opportunities(expected_value);
CREATE INDEX IF NOT EXISTS idx_opportunities_execution ON opportunities(execution_id);

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS entity_id        TEXT,
  ADD COLUMN IF NOT EXISTS skill_id         TEXT,
  ADD COLUMN IF NOT EXISTS execution_status TEXT,
  ADD COLUMN IF NOT EXISTS data_provenance  TEXT,
  ADD COLUMN IF NOT EXISTS economic_state   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       BIGINT;

UPDATE decisions SET
  entity_id        = COALESCE(entity_id, data->>'entityId'),
  skill_id         = COALESCE(skill_id, data->>'skillId'),
  execution_status = COALESCE(execution_status, data->'action'->>'execution'),
  data_provenance  = COALESCE(data_provenance, data->>'dataProvenance', 'demo'),
  economic_state   = COALESCE(economic_state, data->>'economicState', 'estimated'),
  updated_at       = COALESCE(updated_at, created_at)
WHERE entity_id IS NULL OR skill_id IS NULL OR execution_status IS NULL OR data_provenance IS NULL OR economic_state IS NULL OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_decisions_entity ON decisions(entity_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_execution ON decisions(execution_id);

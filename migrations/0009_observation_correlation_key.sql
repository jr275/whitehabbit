-- ================================================================== --
-- Adds the real correlation key (entity:<id> | page:<id> | market:<id>)
-- onto intelligence_observations itself, so the Decision Engine
-- (lib/intelligence/decision-scan.ts) can resolve a real subject
-- (does a page already exist? which entity is this about?) without
-- guessing from free text. Caught during Phase 6C implementation: the
-- first version left this resolution as a permanent stub returning
-- null — a real correctness gap, fixed here rather than left in.
-- ================================================================== --

ALTER TABLE intelligence_observations ADD COLUMN IF NOT EXISTS correlation_key TEXT;
CREATE INDEX IF NOT EXISTS idx_intel_observations_correlation_key ON intelligence_observations(org_id, correlation_key);

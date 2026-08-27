-- ================================================================
-- 0002_financial_foundation.sql — Phase D: canonical Worker + financial
-- Skill foundation.
--
-- Purely additive: three nullable columns, no backfill needed (NULL is
-- the correct, honest value for every row written before this concept
-- existed — see lib/workforce/model.ts's DataProvenance/EconomicState
-- doc comments for why these are two separate columns, not one).
-- ================================================================

-- What the skill honestly reported its underlying DATA was, distinct
-- from execution_mode (which is only about the LLM call itself). NULL
-- means "not set" — callers fall back to the execution_mode-based
-- inference that already existed (see business-results.ts).
ALTER TABLE executions ADD COLUMN IF NOT EXISTS data_provenance TEXT;

-- How far a business-impact metric has travelled toward being real,
-- reconciled cash. Only meaningful when metrics.kind = 'business'.
-- Orthogonal to data_provenance above — never collapse the two.
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS economic_state TEXT;

-- Named economic-value category (cash_preserved, cost_avoided, ...) —
-- see EconomicValueCategory in lib/workforce/model.ts. Only meaningful
-- when metrics.kind = 'business'.
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS value_category TEXT;

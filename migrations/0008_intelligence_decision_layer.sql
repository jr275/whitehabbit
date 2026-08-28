-- ================================================================== --
-- PHASE 6A — INTELLIGENCE DECISION LAYER (ADR-031). Extends the Phase
-- 5B Intelligence domain (Signal/Evidence/Insight/Trend/Recommendation,
-- migrations/0007) with the remaining real stages of the OBSERVE ->
-- UNDERSTAND -> DECIDE -> ACT -> MEASURE -> LEARN loop:
--
--   Signal -> Observation -> Insight -> Recommendation -> Decision ->
--   Action -> Outcome
--
-- Signal/Insight/Recommendation already exist (0007). This migration
-- adds Observation (real multi-signal correlation output, ADR-032),
-- Decision (a real, explainable choice among a closed action taxonomy,
-- ADR-032), Action (a real execution record linked to a real
-- agent_runs row — never a second, parallel run-tracking table),
-- Outcome (a real, measured result), a generic cross-object relation
-- table (never touches the existing, already-tested
-- opportunity_graph_edges), an agent decision audit log, and score
-- calibration records (ADR-034/035).
-- ================================================================== --

-- ---- intelligence_observations: real multi-signal correlation output --
-- (§3 Correlation Engine). A deterministic rule fired over >=1 real
-- Signal rows; never itself a fact, just a real, named pattern match.
CREATE TABLE IF NOT EXISTS intelligence_observations (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  project_id   TEXT NOT NULL REFERENCES projects(id),
  pattern      TEXT NOT NULL, -- e.g. 'high_value_opportunity','content_decay' — the real rule id that fired (lib/intelligence/correlation-engine.ts)
  summary      TEXT NOT NULL,
  signal_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence   DOUBLE PRECISION NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','superseded')),
  source       TEXT NOT NULL DEFAULT 'correlation_engine',
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL,
  expires_at   BIGINT
);
CREATE INDEX IF NOT EXISTS idx_intel_observations_project ON intelligence_observations(org_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_observations_pattern ON intelligence_observations(org_id, pattern);

-- ---- intelligence_decisions: a real, explainable choice (§4) ---------
-- Never "AI decided this" — every row states its own reason/evidence/
-- expected_impact/estimated_cost/risk/confidence, computed by
-- lib/intelligence/decision-engine.ts, a deterministic function.
CREATE TABLE IF NOT EXISTS intelligence_decisions (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id),
  project_id         TEXT NOT NULL REFERENCES projects(id),
  action             TEXT NOT NULL CHECK (action IN (
    'CREATE_PAGE','UPDATE_PAGE','MERGE_PAGES','REDIRECT_PAGE','ADD_INTERNAL_LINKS',
    'CREATE_HUB','CREATE_DATASET','CREATE_CALCULATOR','CREATE_COMPARISON','CREATE_FAQ',
    'REFRESH_CONTENT','INVESTIGATE_ENTITY','EXPAND_MARKET','EXPAND_ROLE','MONITOR','DO_NOTHING'
  )),
  subject_type       TEXT NOT NULL, -- 'opportunity' | 'page' | 'entity'
  subject_id         TEXT,
  reason             TEXT NOT NULL,
  evidence_ids       JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_impact    TEXT NOT NULL,
  estimated_cost     JSONB NOT NULL DEFAULT '{}'::jsonb, -- real {tokens, usd, agentSteps} estimate — never fabricated precision
  risk               TEXT NOT NULL DEFAULT 'low' CHECK (risk IN ('low','medium','high','critical')),
  confidence         DOUBLE PRECISION NOT NULL,
  priority           TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low')),
  recommended_agent  TEXT,
  required_approval  BOOLEAN NOT NULL DEFAULT TRUE,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','expired','cancelled')),
  decided_by         TEXT,
  decided_at         BIGINT,
  expires_at         BIGINT,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intel_decisions_project ON intelligence_decisions(org_id, project_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_intel_decisions_subject ON intelligence_decisions(org_id, subject_type, subject_id);

-- ---- intelligence_actions: the real execution record (§4, §12) -------
-- Deliberately references agent_runs — an Action IS a real WorkflowRun
-- (or a lightweight direct effect for MONITOR/DO_NOTHING), never a
-- second, parallel run-tracking table (ADR-032).
CREATE TABLE IF NOT EXISTS intelligence_actions (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  project_id     TEXT NOT NULL REFERENCES projects(id),
  decision_id    TEXT NOT NULL REFERENCES intelligence_decisions(id) ON DELETE CASCADE,
  agent_run_id   TEXT REFERENCES agent_runs(id), -- null for a no-op action (e.g. DO_NOTHING, MONITOR without a real workflow)
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  output         JSONB,
  started_at     BIGINT,
  completed_at   BIGINT,
  created_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intel_actions_decision ON intelligence_actions(decision_id);
CREATE INDEX IF NOT EXISTS idx_intel_actions_project ON intelligence_actions(org_id, project_id, status);

-- ---- intelligence_outcomes: real, measured results (§13) -------------
CREATE TABLE IF NOT EXISTS intelligence_outcomes (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  project_id   TEXT NOT NULL REFERENCES projects(id),
  action_id    TEXT NOT NULL REFERENCES intelligence_actions(id) ON DELETE CASCADE,
  metric       TEXT NOT NULL, -- e.g. 'impressions_delta_pct','ctr_delta_pct','ai_citations_delta'
  baseline     DOUBLE PRECISION,
  value        DOUBLE PRECISION NOT NULL,
  delta        DOUBLE PRECISION, -- value - baseline, real, computed — null if no real baseline exists yet
  confidence   DOUBLE PRECISION NOT NULL,
  evidence     JSONB NOT NULL DEFAULT '[]'::jsonb,
  measured_at  BIGINT NOT NULL,
  created_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intel_outcomes_action ON intelligence_outcomes(action_id);
CREATE INDEX IF NOT EXISTS idx_intel_outcomes_project ON intelligence_outcomes(org_id, project_id, measured_at DESC);

-- ---- intelligence_relations: generic cross-object graph (§6, §10) ----
-- A NEW, general-purpose edge table for the new Decision-layer objects
-- (Observation/Decision/Action/Outcome) plus Signal/Insight/Trend —
-- deliberately separate from the existing, already-tested
-- opportunity_graph_edges (0007), which stays exactly as-is (ADR-031).
CREATE TABLE IF NOT EXISTS intelligence_relations (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  subject_type   TEXT NOT NULL, -- 'signal'|'observation'|'insight'|'recommendation'|'decision'|'action'|'outcome'
  subject_id     TEXT NOT NULL,
  node_type      TEXT NOT NULL, -- 'entity'|'page'|'opportunity'|'trend'|'market'|'role'|'query'|'signal'|'observation'|'insight'|'decision'
  node_id        TEXT NOT NULL,
  relation       TEXT NOT NULL, -- 'derived_from'|'targets'|'produced'|'measures'|'supports'
  created_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intel_relations_subject ON intelligence_relations(org_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_intel_relations_node ON intelligence_relations(org_id, node_type, node_id);

-- ---- agent_decision_logs: enterprise auditability (§12) ---------------
-- A real, append-only log of every autonomous IN-FLIGHT agent decision
-- (e.g. "auto-publish allowed at LEVEL_3") — distinct from
-- intelligence_decisions, which is the strategic "what to do next"
-- layer. This is the tactical "why did the agent do X right now" trail.
CREATE TABLE IF NOT EXISTS agent_decision_logs (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id),
  agent_run_id      TEXT REFERENCES agent_runs(id),
  agent             TEXT NOT NULL, -- AgentType, e.g. 'ContentGenerationAgent'
  decision          TEXT NOT NULL, -- e.g. 'auto_publish_allowed','auto_publish_denied','approval_requested'
  reason            TEXT NOT NULL,
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy            TEXT, -- e.g. the AutonomyLevel or gate name that governed this decision
  confidence        DOUBLE PRECISION,
  risk              TEXT CHECK (risk IN ('low','medium','high','critical') OR risk IS NULL),
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by       TEXT,
  created_at        BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_decision_logs_run ON agent_decision_logs(agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_decision_logs_org ON agent_decision_logs(org_id, created_at DESC);

-- ---- score_calibrations: predicted vs. actual (§14) -------------------
CREATE TABLE IF NOT EXISTS score_calibrations (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  model            TEXT NOT NULL, -- 'opportunity_score'|'information_gain'|'trend'|'quality_forecast'
  subject_type     TEXT NOT NULL, -- 'opportunity'|'page'|'trend'
  subject_id       TEXT NOT NULL,
  predicted_value  DOUBLE PRECISION NOT NULL,
  actual_value     DOUBLE PRECISION NOT NULL,
  delta            DOUBLE PRECISION NOT NULL,
  outcome_id       TEXT REFERENCES intelligence_outcomes(id),
  computed_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_score_calibrations_model ON score_calibrations(org_id, model, computed_at DESC);

-- ---- real-time incremental recalculation triggers (§7, ADR-033) ------
-- Reuses the exact pg_notify pattern migrations/0005 already
-- established for workflow events — a dedicated channel so listeners
-- (lib/intelligence/recalc-listener.ts) can invalidate/recompute only
-- the real, specific objects a change actually affects, never a full
-- recomputation sweep.
CREATE OR REPLACE FUNCTION notify_intelligence_invalidation() RETURNS trigger AS $$
DECLARE
  event_type TEXT;
  subject_id TEXT;
  org TEXT;
BEGIN
  IF TG_TABLE_NAME = 'search_console_snapshots' THEN
    event_type := 'SearchConsoleImported'; subject_id := NEW.property_id; org := NEW.org_id;
  ELSIF TG_TABLE_NAME = 'trends' THEN
    event_type := 'TrendUpdated'; subject_id := NEW.id; org := NEW.org_id;
  ELSIF TG_TABLE_NAME = 'entities' THEN
    event_type := 'EntityChanged'; subject_id := NEW.id; org := NEW.org_id;
  ELSIF TG_TABLE_NAME = 'pages' THEN
    IF NEW.status = 'published' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'published') THEN
      event_type := 'PagePublished';
    ELSE
      event_type := 'PagePerformanceChanged';
    END IF;
    subject_id := NEW.id; org := NEW.org_id;
  ELSIF TG_TABLE_NAME = 'ai_answers' THEN
    event_type := 'AIVisibilityChanged'; subject_id := NEW.ai_run_id; org := NEW.org_id;
  ELSIF TG_TABLE_NAME = 'dataset_versions' THEN
    event_type := 'DataSourceUpdated'; subject_id := NEW.dataset_id; org := NEW.org_id;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM pg_notify('intelligence_events', json_build_object('event', event_type, 'orgId', org, 'subjectId', subject_id, 'at', extract(epoch FROM now()) * 1000)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_intel_search_console ON search_console_snapshots;
CREATE TRIGGER trg_notify_intel_search_console AFTER INSERT OR UPDATE ON search_console_snapshots FOR EACH ROW EXECUTE FUNCTION notify_intelligence_invalidation();

DROP TRIGGER IF EXISTS trg_notify_intel_trends ON trends;
CREATE TRIGGER trg_notify_intel_trends AFTER INSERT OR UPDATE ON trends FOR EACH ROW EXECUTE FUNCTION notify_intelligence_invalidation();

DROP TRIGGER IF EXISTS trg_notify_intel_entities ON entities;
CREATE TRIGGER trg_notify_intel_entities AFTER INSERT OR UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION notify_intelligence_invalidation();

DROP TRIGGER IF EXISTS trg_notify_intel_pages ON pages;
CREATE TRIGGER trg_notify_intel_pages AFTER INSERT OR UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION notify_intelligence_invalidation();

DROP TRIGGER IF EXISTS trg_notify_intel_ai_answers ON ai_answers;
CREATE TRIGGER trg_notify_intel_ai_answers AFTER INSERT ON ai_answers FOR EACH ROW EXECUTE FUNCTION notify_intelligence_invalidation();

DROP TRIGGER IF EXISTS trg_notify_intel_dataset_versions ON dataset_versions;
CREATE TRIGGER trg_notify_intel_dataset_versions AFTER INSERT ON dataset_versions FOR EACH ROW EXECUTE FUNCTION notify_intelligence_invalidation();

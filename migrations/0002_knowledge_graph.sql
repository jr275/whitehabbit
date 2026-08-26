-- ================================================================
-- 0002_knowledge_graph.sql — Project, Knowledge Graph, Opportunity
-- Engine foundation. See ARCHITECTURE.md, docs/adr/ADR-000..002,
-- ADR-006, ADR-014, ADR-015, and docs/architecture/domain-model.md
-- for the reasoning behind every design choice below.
--
-- Follows the existing schema's own conventions exactly: TEXT
-- prefixed IDs, BIGINT epoch-millisecond timestamps, every
-- tenant-owned row carries org_id and is always queried with it.
-- ================================================================

-- ---- projects: one connected website/workspace per row -----------
-- The brief's explicit "do not assume one tenant = one website" (§8).
-- primary_domain is a descriptive field only — NOT a verified domain
-- binding (see ADR-010); no security decision may depend on it.
CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  name           TEXT NOT NULL,
  primary_domain TEXT,
  created_at     BIGINT NOT NULL,
  created_by     TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);

-- ---- entities: the Knowledge Graph's nodes ------------------------
-- entity_type is deliberately free text, not a fixed enum — the brief
-- requires the ontology to generalize across verticals (§3); the
-- application layer is where a tenant's own ontology is validated,
-- not this table's schema.
CREATE TABLE IF NOT EXISTS entities (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id),
  project_id          TEXT NOT NULL REFERENCES projects(id),
  entity_type         TEXT NOT NULL,
  name                TEXT NOT NULL,
  -- self-FK: set once a merge decision is made (ADR-002's Entity
  -- Resolution note). NULL means "this row is itself canonical."
  canonical_entity_id TEXT REFERENCES entities(id),
  attributes          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id);
CREATE INDEX IF NOT EXISTS idx_entities_org ON entities(org_id);
-- Exact-match dedupe lookup (ADR-002/ADR-009's stated v1 resolution
-- strategy: name+type match within a project) — case-insensitive.
CREATE INDEX IF NOT EXISTS idx_entities_dedupe ON entities(project_id, entity_type, lower(name));

-- ---- entity_relationships: first-class graph edges (§11) ----------
CREATE TABLE IF NOT EXISTS entity_relationships (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id),
  project_id        TEXT NOT NULL REFERENCES projects(id),
  source_entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- e.g. LOCATED_IN, RELATED_TO, TARGETS_ROLE, ANSWERS
  weight            DOUBLE PRECISION,
  confidence        DOUBLE PRECISION,
  source            TEXT NOT NULL, -- what produced this edge, e.g. "skill_seo_opportunity"
  valid_from        BIGINT,
  valid_to          BIGINT,
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON entity_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON entity_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_project ON entity_relationships(project_id);

-- ---- entity_evidence: provenance per fact (§13, ADR-005) ----------
-- verification_status defaults to 'unverified' — only a real
-- FactCheckAgent (not built yet) is allowed to write 'verified' or
-- 'conflicting'; nothing in this revision does that cross-checking.
CREATE TABLE IF NOT EXISTS entity_evidence (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id),
  project_id          TEXT NOT NULL REFERENCES projects(id),
  entity_id           TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  fact                TEXT NOT NULL,
  source_url          TEXT,
  source_type         TEXT NOT NULL, -- e.g. "web_search", "llm_inference"
  retrieved_at        BIGINT NOT NULL,
  confidence          DOUBLE PRECISION,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('verified','unverified','conflicting','stale','deprecated')),
  created_at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON entity_evidence(entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_project ON entity_evidence(project_id);

-- ---- opportunities: the Opportunity Engine (§17-19, ADR-006) ------
-- Every *_score column is NULL unless a real computation backs it —
-- see ADR-005/ADR-006/ADR-015. NULL must never be rendered as 0 or a
-- guessed value by any consumer.
CREATE TABLE IF NOT EXISTS opportunities (
  id                          TEXT PRIMARY KEY,
  org_id                      TEXT NOT NULL REFERENCES organizations(id),
  project_id                  TEXT NOT NULL REFERENCES projects(id),
  -- provenance: exactly which agent run produced this opportunity
  source_execution_id         TEXT NOT NULL REFERENCES executions(id),
  source_output_id            TEXT NOT NULL REFERENCES outputs(id),
  primary_entity_id           TEXT REFERENCES entities(id),

  title                       TEXT NOT NULL,
  topic                       TEXT NOT NULL,
  target_intent               TEXT,
  outline                     JSONB NOT NULL DEFAULT '[]'::jsonb,

  status                      TEXT NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered','qualified','approved','rejected','generating','published','monitoring','stale','merged')),

  -- explainable score components (ADR-006) — computed today:
  source_grounding_score      DOUBLE PRECISION,
  outline_completeness_score  DOUBLE PRECISION,
  confidence_score            DOUBLE PRECISION,
  -- reserved, NULL until the integration that computes them exists
  -- (docs/architecture/risks.md R-7):
  demand_score                DOUBLE PRECISION,
  trend_score                 DOUBLE PRECISION,
  business_value_score        DOUBLE PRECISION,
  competition_score           DOUBLE PRECISION,
  authority_gap_score         DOUBLE PRECISION,
  information_gain_score      DOUBLE PRECISION,
  citation_potential_score    DOUBLE PRECISION,
  cannibalization_risk_score  DOUBLE PRECISION,

  final_score                 DOUBLE PRECISION,
  score_notes                 TEXT, -- human-readable explanation of which components fed final_score

  reviewed_by                 TEXT REFERENCES users(id),
  reviewed_at                 BIGINT,

  created_at                  BIGINT NOT NULL,
  updated_at                  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunities_project ON opportunities(project_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities(org_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_execution ON opportunities(source_execution_id);

-- ================================================================== --
-- INTELLIGENCE LAYER FOUNDATION (Phase 5B, ADR-024) — Signal, Evidence,
-- Insight, Trend, Intent, Query, Opportunity Graph, AI Visibility,
-- Search Console, external data connectors, and the Recommendation
-- Engine. Every table here is tenant-scoped (org_id, most also
-- project_id) and every observation carries a real confidence/
-- verification/status discipline — never a fabricated value where
-- "unavailable" is the honest answer (§40).
-- ================================================================== --

-- ---- signals: raw observed information (§10) -------------------------
-- Deliberately NOT automatically a fact — a signal is an observation,
-- confidence-scored, with a real source. Polymorphic subject (an
-- entity/market/role/intent it's about) via nullable FK-shaped text
-- columns rather than a hard FK, since a signal may reference any of
-- several tables — validated at the application layer instead
-- (mirrors how opportunities.primary_entity_id / target_intent already
-- work as soft references in this codebase).
CREATE TABLE IF NOT EXISTS signals (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  project_id    TEXT NOT NULL REFERENCES projects(id),
  source_id     TEXT, -- references data_sources(id) when the signal came from an external connector
  type          TEXT NOT NULL, -- e.g. 'search_impression_spike','query_emergence','page_decay','stale_data'
  entity_id     TEXT REFERENCES entities(id),
  market_id     TEXT, -- references markets(id) — nullable, defined below in this file
  role_id       TEXT,
  intent_id     TEXT,
  value         JSONB NOT NULL DEFAULT '{}'::jsonb, -- real, structured observed value — shape depends on `type`
  observed_at   BIGINT NOT NULL,
  source        TEXT NOT NULL, -- human-readable origin, e.g. 'search_console','trend_engine','manual'
  confidence    DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  raw_reference TEXT, -- pointer to the raw observation this was derived from (e.g. a search_query_observations.id)
  created_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signals_project ON signals(org_id, project_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(org_id, type);
CREATE INDEX IF NOT EXISTS idx_signals_entity ON signals(entity_id) WHERE entity_id IS NOT NULL;

-- ---- evidence: unified provenance for non-entity artifacts (§11, ADR-029) --
-- entity_evidence (migrations/0002) already covers entity-attached
-- facts; this table covers everything else the brief names (Insight,
-- Opportunity, Page, Answer, Recommendation) through one polymorphic
-- subject (subject_type, subject_id) rather than a new FK-typed table
-- per subject — see ADR-029 for why these are kept as two tables
-- instead of migrating entity_evidence into this one.
CREATE TABLE IF NOT EXISTS evidence (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id),
  project_id          TEXT NOT NULL REFERENCES projects(id),
  subject_type        TEXT NOT NULL, -- 'opportunity' | 'insight' | 'page' | 'answer' | 'recommendation' | 'fact'
  subject_id          TEXT NOT NULL,
  source              TEXT NOT NULL,
  source_type         TEXT NOT NULL,
  source_url          TEXT,
  retrieved_at        BIGINT NOT NULL,
  published_at        BIGINT,
  valid_from          BIGINT,
  valid_until         BIGINT,
  content_hash        TEXT,
  confidence          DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('verified','unverified','conflicting','stale','deprecated')),
  created_at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_subject ON evidence(org_id, subject_type, subject_id);

-- ---- insights: a real, evidence-backed conclusion (§9) ----------------
CREATE TABLE IF NOT EXISTS insights (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  category    TEXT NOT NULL, -- e.g. 'search_performance','trend','competitor','data_freshness'
  confidence  DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  signal_ids  JSONB NOT NULL DEFAULT '[]'::jsonb, -- real signal ids this insight was derived from
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_insights_project ON insights(org_id, project_id, created_at DESC);

-- ---- trends: real, thresholded movement over signal time-series (§15) --
CREATE TABLE IF NOT EXISTS trends (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  project_id    TEXT NOT NULL REFERENCES projects(id),
  label         TEXT NOT NULL, -- what the trend is about, e.g. a query/entity name
  entity_id     TEXT REFERENCES entities(id),
  state         TEXT NOT NULL CHECK (state IN ('emerging','rising','stable','declining','breaking')),
  velocity      DOUBLE PRECISION NOT NULL, -- % change over the measured window
  acceleration  DOUBLE PRECISION, -- change in velocity between two windows — null until a second snapshot exists
  momentum      DOUBLE PRECISION NOT NULL, -- velocity weighted by real observation volume
  seasonality   TEXT, -- 'none' | 'weekly' | 'monthly' | 'unknown' — never fabricated beyond real detected periodicity
  confidence    DOUBLE PRECISION NOT NULL,
  signal_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_at   BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trends_project ON trends(org_id, project_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_trends_state ON trends(org_id, state);

-- ---- intent / query: real classification, not a bare keyword label (§17) --
CREATE TABLE IF NOT EXISTS queries (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  text             TEXT NOT NULL,
  normalized_text  TEXT NOT NULL, -- lowercased, whitespace-collapsed — real dedupe key
  intent           TEXT CHECK (intent IN (
    'informational','commercial','transactional','navigational','local',
    'comparison','problem','how_to','definition','research','investment'
  )),
  intent_confidence DOUBLE PRECISION,
  entity_id        TEXT REFERENCES entities(id),
  market_id        TEXT,
  role_id          TEXT,
  page_id          TEXT REFERENCES pages(id),
  source           TEXT NOT NULL, -- 'search_console' | 'manual' | 'trend_engine'
  first_observed_at BIGINT NOT NULL,
  last_observed_at  BIGINT NOT NULL,
  created_at       BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_queries_project_text ON queries(project_id, normalized_text);
CREATE INDEX IF NOT EXISTS idx_queries_project ON queries(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_queries_intent ON queries(org_id, intent) WHERE intent IS NOT NULL;

-- ---- roles: operational intelligence per role (§18) --------------------
CREATE TABLE IF NOT EXISTS roles (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations(id),
  project_id           TEXT NOT NULL REFERENCES projects(id),
  name                 TEXT NOT NULL,
  questions            JSONB NOT NULL DEFAULT '[]'::jsonb,
  pain_points          JSONB NOT NULL DEFAULT '[]'::jsonb,
  kpis                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  decision_criteria    JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_terminology JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_project_name ON roles(project_id, lower(name));

-- ---- markets / metrics: generic, no hard-coded vertical (§19) ---------
CREATE TABLE IF NOT EXISTS markets (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  geography   TEXT, -- free text — a city, region, country; never assumed real-estate-specific
  created_at  BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_markets_project_name ON markets(project_id, lower(name));

CREATE TABLE IF NOT EXISTS metric_definitions (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL, -- e.g. 'demand','supply','growth','price','conversion'
  unit        TEXT NOT NULL,
  methodology TEXT NOT NULL, -- real, human-readable description of how this metric is computed/sourced
  source      TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_defs_project_name ON metric_definitions(project_id, lower(name));

CREATE TABLE IF NOT EXISTS metric_observations (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organizations(id),
  metric_definition_id TEXT NOT NULL REFERENCES metric_definitions(id) ON DELETE CASCADE,
  market_id           TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  period              TEXT NOT NULL, -- e.g. '2026-08', '2026-Q3' — real methodology-defined period, never assumed daily
  value               DOUBLE PRECISION NOT NULL,
  observed_at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metric_obs_series ON metric_observations(metric_definition_id, market_id, period);

-- ---- external data connectors (§20-21) --------------------------------
CREATE TABLE IF NOT EXISTS data_sources (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  name             TEXT NOT NULL,
  connector        TEXT NOT NULL, -- real registered connector key — see lib/intelligence/connectors/registry.ts
  freshness_policy TEXT NOT NULL DEFAULT 'static'
    CHECK (freshness_policy IN ('real_time','hourly','daily','weekly','monthly','quarterly','static')),
  config           JSONB NOT NULL DEFAULT '{}'::jsonb, -- non-secret connector config only — never a credential (mirrors §15's domain-token discipline)
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_sources_project ON data_sources(org_id, project_id);

CREATE TABLE IF NOT EXISTS datasets (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  data_source_id  TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  schema          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  dataset_id  TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  row_count   INTEGER NOT NULL DEFAULT 0,
  fetched_at  BIGINT NOT NULL,
  is_stale    BOOLEAN NOT NULL DEFAULT FALSE, -- real, computed from the dataset's freshness_policy vs fetched_at — never guessed
  created_at  BIGINT NOT NULL,
  UNIQUE (dataset_id, version)
);

CREATE TABLE IF NOT EXISTS data_observations (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id),
  dataset_version_id TEXT NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  entity_id          TEXT REFERENCES entities(id),
  key                TEXT NOT NULL,
  value              JSONB NOT NULL,
  observed_at        BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_observations_version ON data_observations(dataset_version_id);

-- ---- search console (§12-14) — real schema; live OAuth ingestion is  --
-- gated behind real credentials (lib/intelligence/search-console/*),   --
-- never fabricated when absent (§40).                                  --
CREATE TABLE IF NOT EXISTS search_console_properties (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  project_id   TEXT NOT NULL REFERENCES projects(id),
  site_url     TEXT NOT NULL, -- the real GSC-verified property identifier, e.g. 'sc-domain:example.com'
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gsc_properties ON search_console_properties(project_id, site_url);

CREATE TABLE IF NOT EXISTS search_console_snapshots (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  property_id  TEXT NOT NULL REFERENCES search_console_properties(id) ON DELETE CASCADE,
  date         TEXT NOT NULL, -- 'YYYY-MM-DD', the real GSC reporting day
  clicks       INTEGER NOT NULL,
  impressions  INTEGER NOT NULL,
  ctr          DOUBLE PRECISION NOT NULL,
  position     DOUBLE PRECISION NOT NULL,
  ingested_at  BIGINT NOT NULL,
  UNIQUE (property_id, date)
);

CREATE TABLE IF NOT EXISTS search_query_observations (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  property_id  TEXT NOT NULL REFERENCES search_console_properties(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  query        TEXT NOT NULL,
  country      TEXT,
  device       TEXT,
  clicks       INTEGER NOT NULL,
  impressions  INTEGER NOT NULL,
  ctr          DOUBLE PRECISION NOT NULL,
  position     DOUBLE PRECISION NOT NULL,
  ingested_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_query_obs ON search_query_observations(property_id, date);

CREATE TABLE IF NOT EXISTS search_page_observations (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  property_id  TEXT NOT NULL REFERENCES search_console_properties(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  page_url     TEXT NOT NULL,
  clicks       INTEGER NOT NULL,
  impressions  INTEGER NOT NULL,
  ctr          DOUBLE PRECISION NOT NULL,
  position     DOUBLE PRECISION NOT NULL,
  ingested_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_page_obs ON search_page_observations(property_id, date);

-- ---- AI visibility (§27-30) — real provider calls only; every ---------
-- observation carries provenance; no fabricated rankings/citations.
CREATE TABLE IF NOT EXISTS ai_prompts (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  label       TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  prompt_id   TEXT NOT NULL REFERENCES ai_prompts(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded','failed','blocked')),
  error       TEXT,
  run_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_prompt ON ai_runs(prompt_id, run_at DESC);

CREATE TABLE IF NOT EXISTS ai_answers (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id),
  ai_run_id         TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  raw_text          TEXT NOT NULL,
  mentioned_entities JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{entityId|name, mentioned:boolean}]
  brand_mentioned   BOOLEAN NOT NULL DEFAULT FALSE,
  competitor_mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment         TEXT CHECK (sentiment IN ('positive','neutral','negative','mixed') OR sentiment IS NULL),
  confidence        DOUBLE PRECISION NOT NULL,
  created_at        BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_citations (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  ai_answer_id   TEXT NOT NULL REFERENCES ai_answers(id) ON DELETE CASCADE,
  source_url     TEXT NOT NULL,
  page_id        TEXT REFERENCES pages(id), -- set when the cited URL matches one of this tenant's own published pages
  entity_id      TEXT REFERENCES entities(id),
  created_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_citations_page ON ai_citations(page_id) WHERE page_id IS NOT NULL;

-- ---- page intelligence feedback (§32) ----------------------------------
CREATE TABLE IF NOT EXISTS page_score_snapshots (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id),
  page_id               TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  taken_at              BIGINT NOT NULL,
  milestone             TEXT NOT NULL, -- 'pre_publish' | 'day_30' | 'day_60' | 'day_90' | 'manual'
  technical_seo_score   DOUBLE PRECISION,
  entity_coverage_score DOUBLE PRECISION,
  information_gain_score DOUBLE PRECISION,
  intent_match_score    DOUBLE PRECISION,
  aeo_score             DOUBLE PRECISION,
  geo_score             DOUBLE PRECISION,
  evidence_score        DOUBLE PRECISION,
  freshness_score       DOUBLE PRECISION,
  internal_links_count  INTEGER,
  business_value_score  DOUBLE PRECISION,
  search_clicks         INTEGER, -- real, from search_console_snapshots when available — NULL, never 0, if unavailable
  search_impressions    INTEGER,
  ai_visibility_mentions INTEGER
);
CREATE INDEX IF NOT EXISTS idx_page_score_snapshots_page ON page_score_snapshots(page_id, taken_at DESC);

-- ---- opportunity graph (§25) — generic edges, not a new bespoke table --
-- per relationship type. Mirrors entity_relationships' shape.
CREATE TABLE IF NOT EXISTS opportunity_graph_edges (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  node_type       TEXT NOT NULL, -- 'signal'|'trend'|'query'|'intent'|'entity'|'role'|'market'|'evidence'|'data_observation'|'business_goal'|'page'
  node_id         TEXT NOT NULL,
  relation        TEXT NOT NULL, -- e.g. 'derived_from','targets','supports'
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opp_graph_opportunity ON opportunity_graph_edges(opportunity_id);

-- ---- recommendations (§33) --------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  project_id      TEXT NOT NULL REFERENCES projects(id),
  action          TEXT NOT NULL, -- 'refresh_page'|'create_market_page'|'add_evidence'|'build_calculator'|'merge_pages'|'add_entity_relationship'|'investigate_query'|'create_data_asset'
  subject_type    TEXT NOT NULL, -- 'page'|'opportunity'|'entity'|'query'
  subject_id      TEXT,
  reason          TEXT NOT NULL,
  evidence_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_impact TEXT NOT NULL,
  confidence      DOUBLE PRECISION NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed','done')),
  created_at      BIGINT NOT NULL,
  resolved_at     BIGINT
);
CREATE INDEX IF NOT EXISTS idx_recommendations_project ON recommendations(org_id, project_id, status);

-- ---- information gain v2 (§23) — extend opportunities with the new ---
-- named components (all nullable — Known/Estimated/Unavailable, never
-- fabricated) rather than a second scoring table.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS information_gain_components JSONB;

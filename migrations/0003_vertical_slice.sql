-- ================================================================
-- 0003_vertical_slice.sql — the first real end-to-end vertical slice:
-- Website -> Discovery -> Crawl -> Knowledge Profile -> Entities ->
-- Opportunities -> Approval -> PageBrief -> Content Pipeline -> Page
-- -> Public render. See ARCHITECTURE.md, docs/adr/ADR-016, and
-- docs/architecture/vertical-slice.md for the reasoning.
--
-- Same conventions as 0001/0002: prefixed TEXT ids, epoch-ms BIGINT
-- timestamps, every tenant-owned row carries org_id and project_id.
-- ================================================================

-- ---- websites: a connected website inside a Project (§9) ----------
CREATE TABLE IF NOT EXISTS websites (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  url              TEXT NOT NULL,           -- exactly as submitted
  normalized_url   TEXT NOT NULL,           -- lowercased host, stripped trailing slash/fragment
  hostname         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','failed')),
  discovery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (discovery_status IN ('pending','discovering','discovered','crawling','crawled','analyzing','ready','failed')),
  discovery_error  TEXT,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL,
  created_by       TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_websites_project ON websites(project_id);
CREATE INDEX IF NOT EXISTS idx_websites_org ON websites(org_id);

-- ---- agent_runs / agent_run_steps: durable ledger for pipelines
-- that are NOT a single Worker+Skill call (ADR-016). Deliberately a
-- parallel structure to executions/execution_events, not a reuse of
-- them: those tables FK to workers(id), and a website-discovery or
-- content-generation pipeline run is a system/project-level action
-- with no operator-configured Worker involved. Same durability
-- properties: every step persisted as it completes.
CREATE TABLE IF NOT EXISTS agent_runs (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  project_id     TEXT NOT NULL REFERENCES projects(id),
  pipeline       TEXT NOT NULL, -- 'website_discovery' | 'content_generation'
  subject_type   TEXT NOT NULL, -- 'website' | 'opportunity'
  subject_id     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','blocked','pending_approval')),
  error_reason   TEXT,
  cost_usd       DOUBLE PRECISION,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  model          TEXT,
  started_at     BIGINT NOT NULL,
  completed_at   BIGINT,
  duration_ms    INTEGER,
  created_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_subject ON agent_runs(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  agent_run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step         TEXT NOT NULL, -- e.g. 'crawl','profile','extract_entities','research','outline','draft','seo','geo','quality'
  sequence     INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','skipped')),
  input        JSONB,  -- small, non-secret step input (never a credential/token)
  output       JSONB,  -- small, non-secret step output summary
  error        TEXT,
  cost_usd     DOUBLE PRECISION,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model        TEXT,
  started_at   BIGINT,
  completed_at BIGINT,
  duration_ms  INTEGER,
  created_at   BIGINT NOT NULL,
  UNIQUE (agent_run_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run ON agent_run_steps(agent_run_id);

-- ---- crawls / crawl_pages / crawl_links (§4) -----------------------
CREATE TABLE IF NOT EXISTS crawls (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  website_id       TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  agent_run_id     TEXT REFERENCES agent_runs(id),
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  max_pages        INTEGER NOT NULL,
  max_depth        INTEGER NOT NULL,
  pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_crawled    INTEGER NOT NULL DEFAULT 0,
  error_count      INTEGER NOT NULL DEFAULT 0,
  started_at       BIGINT NOT NULL,
  completed_at     BIGINT
);
CREATE INDEX IF NOT EXISTS idx_crawls_website ON crawls(website_id);

-- content is stored as extracted plain text, bounded (see
-- lib/crawler/html.ts's MAX_EXTRACTED_TEXT) — never the raw HTML
-- document, per §4's explicit instruction not to store enormous HTML
-- in relational tables. structured_data holds any JSON-LD found.
CREATE TABLE IF NOT EXISTS crawl_pages (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  crawl_id         TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  website_id       TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  canonical_url    TEXT,
  status_code      INTEGER,
  content_type     TEXT,
  title            TEXT,
  description      TEXT,
  language         TEXT, -- from <html lang="...">, when present
  extracted_text   TEXT, -- bounded plain-text extraction, not raw HTML
  structured_data  JSONB, -- JSON-LD blocks found on the page, verbatim
  word_count       INTEGER,
  content_hash     TEXT,
  robots_allowed   BOOLEAN NOT NULL DEFAULT TRUE,
  indexable        BOOLEAN NOT NULL DEFAULT TRUE,
  crawl_depth      INTEGER NOT NULL DEFAULT 0,
  parent_url       TEXT,
  error            TEXT,
  discovered_at    BIGINT NOT NULL,
  crawled_at       BIGINT
);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_crawl ON crawl_pages(crawl_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_website ON crawl_pages(website_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_url ON crawl_pages(website_id, url);

CREATE TABLE IF NOT EXISTS crawl_links (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  crawl_id        TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  source_page_id  TEXT NOT NULL REFERENCES crawl_pages(id) ON DELETE CASCADE,
  target_url      TEXT NOT NULL,
  anchor_text     TEXT,
  rel             TEXT,
  is_internal     BOOLEAN NOT NULL,
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crawl_links_source ON crawl_links(source_page_id);
CREATE INDEX IF NOT EXISTS idx_crawl_links_crawl ON crawl_links(crawl_id);

-- ---- website_knowledge_profiles (§5) -------------------------------
-- Every inferred field lives inside `profile`/`confidence` JSONB
-- rather than as fixed columns — the ontology must generalize across
-- verticals (§3), so the profile's shape is not baked into the schema.
CREATE TABLE IF NOT EXISTS website_knowledge_profiles (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id),
  project_id      TEXT NOT NULL REFERENCES projects(id),
  website_id      TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  source_crawl_id TEXT NOT NULL REFERENCES crawls(id),
  profile         JSONB NOT NULL,   -- the real, computed profile fields
  confidence      JSONB NOT NULL,   -- 0-1 confidence per top-level profile field
  created_at      BIGINT NOT NULL,
  UNIQUE (website_id, version)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_profiles_website ON website_knowledge_profiles(website_id);

-- ---- entity_merge_candidates (§7 Entity Resolution) ----------------
-- Confidence 0.75-0.95 candidates a human must review before merging.
-- >=0.95 auto-merges immediately (sets entities.canonical_entity_id)
-- and is recorded here too, status='auto_merged', for full auditability.
CREATE TABLE IF NOT EXISTS entity_merge_candidates (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id),
  project_id         TEXT NOT NULL REFERENCES projects(id),
  entity_id          TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  candidate_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  confidence         DOUBLE PRECISION NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','auto_merged')),
  reviewed_by        TEXT REFERENCES users(id),
  reviewed_at        BIGINT,
  created_at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_merge_candidates_entity ON entity_merge_candidates(entity_id);
CREATE INDEX IF NOT EXISTS idx_merge_candidates_status ON entity_merge_candidates(status);

-- entity_evidence gets a direct pointer back to the exact crawled page
-- it came from, when it did — nullable because evidence can also come
-- from a non-crawl source (e.g. skill_seo_opportunity's web search).
ALTER TABLE entity_evidence ADD COLUMN IF NOT EXISTS crawl_page_id TEXT REFERENCES crawl_pages(id);

-- ---- opportunities: broaden provenance beyond the single-skill path
-- Opportunities can now also come from real website-discovery
-- (agent_runs), not only a Worker Skill execution (executions) — see
-- docs/adr/ADR-016. Both provenance columns become nullable; a CHECK
-- ensures at least one real source is always recorded.
ALTER TABLE opportunities ALTER COLUMN source_execution_id DROP NOT NULL;
ALTER TABLE opportunities ALTER COLUMN source_output_id DROP NOT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_agent_run_id TEXT REFERENCES agent_runs(id);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS website_id TEXT REFERENCES websites(id);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS opportunity_type TEXT; -- e.g. entity_coverage_gap, market_gap, question_gap, comparison, supporting_content, hub, spoke
-- entity_coverage_score: real, computed from evidence+relationship counts (§11) — "Known", never NULL once an opportunity has a primary entity.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS entity_coverage_score DOUBLE PRECISION;
-- information_gain_score is now computed by a real deterministic model (§12, amends ADR-015) — information_gain_reasons carries the explanation.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS information_gain_reasons JSONB;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_source_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_source_check
  CHECK (source_execution_id IS NOT NULL OR source_agent_run_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_opportunities_website ON opportunities(website_id);

-- ---- page_briefs (§14) ---------------------------------------------
CREATE TABLE IF NOT EXISTS page_briefs (
  id                        TEXT PRIMARY KEY,
  org_id                    TEXT NOT NULL REFERENCES organizations(id),
  project_id                TEXT NOT NULL REFERENCES projects(id),
  opportunity_id            TEXT NOT NULL REFERENCES opportunities(id),
  target_intent             TEXT,
  primary_entity_id         TEXT REFERENCES entities(id),
  secondary_entity_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,
  market                    TEXT,
  role                      TEXT,
  questions                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  information_gain_strategy TEXT,
  required_evidence         JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_sections      JSONB NOT NULL DEFAULT '[]'::jsonb,
  schema_strategy           JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_link_strategy    TEXT,
  source_requirements       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_briefs_opportunity ON page_briefs(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_page_briefs_project ON page_briefs(project_id);

-- ---- content_artifacts (§15) ---------------------------------------
CREATE TABLE IF NOT EXISTS content_artifacts (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id),
  project_id     TEXT NOT NULL REFERENCES projects(id),
  page_brief_id  TEXT NOT NULL REFERENCES page_briefs(id) ON DELETE CASCADE,
  agent_run_id   TEXT NOT NULL REFERENCES agent_runs(id),
  type           TEXT NOT NULL CHECK (type IN ('research','outline','draft','seo','geo','quality')),
  version        INTEGER NOT NULL DEFAULT 1,
  content        JSONB NOT NULL,
  created_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_artifacts_brief ON content_artifacts(page_brief_id);
CREATE INDEX IF NOT EXISTS idx_content_artifacts_run ON content_artifacts(agent_run_id);

-- ---- pages / page_versions (§21-22) --------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id                     TEXT PRIMARY KEY,
  org_id                 TEXT NOT NULL REFERENCES organizations(id),
  project_id             TEXT NOT NULL REFERENCES projects(id),
  opportunity_id         TEXT NOT NULL REFERENCES opportunities(id),
  page_brief_id          TEXT NOT NULL REFERENCES page_briefs(id),
  page_template_id       TEXT, -- reserved for the future RouteTemplate/PageTemplate engine (ADR-016) — always NULL today
  slug                   TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','quality_rejected','ready','published')),
  title                  TEXT,
  meta_description       TEXT,
  canonical_url          TEXT,
  quality_score          DOUBLE PRECISION,
  seo_score              DOUBLE PRECISION,
  aeo_score              DOUBLE PRECISION,
  geo_score              DOUBLE PRECISION,
  information_gain_score DOUBLE PRECISION,
  rejection_reasons      JSONB,
  published_version_id   TEXT, -- FK added below, once page_versions exists
  created_at             BIGINT NOT NULL,
  updated_at             BIGINT NOT NULL,
  UNIQUE (project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project_id);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
CREATE INDEX IF NOT EXISTS idx_pages_opportunity ON pages(opportunity_id);

CREATE TABLE IF NOT EXISTS page_versions (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL REFERENCES organizations(id),
  page_id            TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  content            JSONB NOT NULL,  -- structured content blocks (title, sections[])
  structured_content JSONB,           -- normalized entity/claim references
  schema             JSONB,           -- generated JSON-LD graph
  seo_metadata       JSONB,           -- title/description/canonical/slug as actually published
  created_by         TEXT REFERENCES users(id), -- NULL when system/agent-generated
  agent_run_id       TEXT REFERENCES agent_runs(id),
  quality_status     TEXT NOT NULL CHECK (quality_status IN ('draft','quality_rejected','ready','published')),
  created_at         BIGINT NOT NULL,
  UNIQUE (page_id, version)
);
CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id);

ALTER TABLE pages
  ADD CONSTRAINT fk_pages_published_version
  FOREIGN KEY (published_version_id) REFERENCES page_versions(id);

-- ---- internal_links (§25) -------------------------------------------
CREATE TABLE IF NOT EXISTS internal_links (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  source_page_id   TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  target_page_id   TEXT REFERENCES pages(id) ON DELETE CASCADE,
  target_entity_id TEXT REFERENCES entities(id),
  reason           TEXT NOT NULL,
  relationship_type TEXT,
  confidence       DOUBLE PRECISION,
  created_at       BIGINT NOT NULL,
  CHECK (target_page_id IS NOT NULL OR target_entity_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_internal_links_source ON internal_links(source_page_id);

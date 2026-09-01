-- ================================================================
-- 0002_knowledge_m1.sql — AI Knowledge Library, Milestone 1.
--
-- PURELY ADDITIVE. No existing table is altered, renamed or dropped.
-- The Workforce/Studio product is unaffected by this migration.
--
-- Tenancy: `organizations` remains the physical tenant table and is
-- SHARED by both products (Phase 5 R4). It is deliberately NOT renamed
-- to `workspaces` — that would touch every Workforce repository
-- function for a cosmetic gain. Knowledge code calls it `workspaceId`
-- in its own domain language and maps it in exactly one place
-- (lib/knowledge/access).
--
-- Conventions follow 0001_init.sql exactly: prefixed TEXT ids,
-- BIGINT epoch-milliseconds, JSONB for documents.
--
-- Deliberately NOT created here (Milestone 1 has no AI): embeddings,
-- vector columns, chunks, topics, entities, collections, graph edges,
-- recommendations, audio, research, agent tables. The model is shaped
-- so each can be added later without altering these tables.
-- ================================================================

-- ---- the aggregate root -----------------------------------------
-- Owned by the ORGANIZATION, not by a user. Content is stored once
-- per workspace and is never duplicated per user; anything specific
-- to one person lives in knowledge_user_state.
CREATE TABLE IF NOT EXISTS knowledge_objects (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by           TEXT REFERENCES users(id),

  -- source identity. submitted_url is preserved verbatim, always.
  submitted_url        TEXT NOT NULL,
  canonical_url        TEXT NOT NULL,
  url_hash             CHAR(64) NOT NULL,   -- sha256(canonical_url)
  resolved_url         TEXT,                -- final URL after redirects
  origin_url           TEXT,                -- pre-redirect URL when a real redirect occurred
  domain               TEXT NOT NULL,

  -- extracted metadata; every one of these may legitimately be NULL
  title                TEXT,
  authors              TEXT[] NOT NULL DEFAULT '{}',
  excerpt              TEXT,
  published_at         BIGINT,
  language             TEXT,
  site_name            TEXT,
  image_url            TEXT,
  favicon_url          TEXT,
  word_count           INTEGER,
  reading_time_seconds INTEGER,

  -- ingestion state machine (lib/knowledge/ingestion/state.ts)
  status               TEXT NOT NULL DEFAULT 'pending',
  failure_code         TEXT,
  failure_message      TEXT,   -- user-facing, plain language, never a stack trace
  extractor            TEXT,   -- which extraction tier produced the content
  http_status          SMALLINT,

  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL,
  deleted_at           BIGINT,

  CONSTRAINT knowledge_objects_status_check
    CHECK (status IN ('pending', 'fetching', 'extracting', 'completed', 'failed'))
);

-- Duplicate detection: one object per canonicalised URL per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_objects_url
  ON knowledge_objects (org_id, url_hash);

-- The default library view.
CREATE INDEX IF NOT EXISTS idx_knowledge_objects_list
  ON knowledge_objects (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- "what is still processing"
CREATE INDEX IF NOT EXISTS idx_knowledge_objects_status
  ON knowledge_objects (org_id, status);

-- ---- the bytes ---------------------------------------------------
-- Split from the root because it is large and read only in the reader
-- and the pipeline, never in a list query.
CREATE TABLE IF NOT EXISTS knowledge_content (
  object_id     TEXT PRIMARY KEY REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content_html  TEXT,             -- SANITIZED on write; never raw source HTML
  content_text  TEXT,             -- the contract every future stage reads
  content_hash  CHAR(64),         -- sha256(content_text)
  extracted_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_content_org ON knowledge_content (org_id);

-- ---- the job queue ------------------------------------------------
-- Milestone 1 deliberately introduces NO queue dependency. This table
-- is the queue: claiming is a compare-and-swap UPDATE with
-- FOR UPDATE SKIP LOCKED, retries carry exponential backoff in
-- run_after, and a reaper reclaims rows whose worker died. The
-- transport is temporary; the semantics are not.
CREATE TABLE IF NOT EXISTS knowledge_jobs (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_id        TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'ingest',
  status           TEXT NOT NULL DEFAULT 'pending',
  attempt          SMALLINT NOT NULL DEFAULT 0,
  max_attempts     SMALLINT NOT NULL DEFAULT 3,
  run_after        BIGINT NOT NULL,        -- exponential backoff target
  locked_at        BIGINT,                 -- set on claim; drives the reaper
  locked_by        TEXT,                   -- opaque runner id, for tracing
  idempotency_key  TEXT NOT NULL,
  last_error_code  TEXT,
  last_error       TEXT,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL,

  CONSTRAINT knowledge_jobs_status_check
    CHECK (status IN ('pending', 'active', 'completed', 'failed'))
);

-- One live job per (object, kind): repeated save requests can never
-- create uncontrolled duplicate ingestion work.
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_jobs_idempotency
  ON knowledge_jobs (idempotency_key);

-- The claim query's index: pending work whose backoff has elapsed.
CREATE INDEX IF NOT EXISTS idx_knowledge_jobs_claim
  ON knowledge_jobs (status, run_after)
  WHERE status = 'pending';

-- The reaper's index: active work whose lock has gone stale.
CREATE INDEX IF NOT EXISTS idx_knowledge_jobs_stale
  ON knowledge_jobs (status, locked_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_knowledge_jobs_object ON knowledge_jobs (object_id);

-- ---- per-user state -----------------------------------------------
-- The content/user-state separation (Phase 2 §8). Content above is
-- shared per workspace; a person's relationship with it lives here.
-- Rows are created lazily on first interaction, so this table is
-- proportional to engagement rather than to library size.
--
-- Milestone 1 writes only the two columns it actually uses. Starred,
-- archived and reading progress arrive with the milestone that ships
-- those actions — the point here is that the SEAM exists, so adding
-- them never has to touch knowledge_objects.
CREATE TABLE IF NOT EXISTS knowledge_user_state (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_id      TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  last_opened_at BIGINT,
  opened_count   INTEGER NOT NULL DEFAULT 0,
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL,
  PRIMARY KEY (user_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_user_state_object ON knowledge_user_state (object_id);

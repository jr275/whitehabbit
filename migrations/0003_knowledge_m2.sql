-- ================================================================
-- 0003_knowledge_m2.sql — Knowledge Library, Milestone 2.
--
-- PURELY ADDITIVE. One new table plus new nullable columns. No
-- existing column is dropped, renamed or retyped, no existing row is
-- rewritten, and nothing here touches the Workforce/Studio product.
-- An M1 deployment keeps working against this schema unchanged, which
-- is what makes the migration safe to run before the code that uses
-- it.
--
-- The milestone's single hard requirement: WE MUST NEVER LOSE THE
-- ORIGINAL FETCHED REPRESENTATION. Everything else here exists to
-- serve it — knowing which bytes produced an extraction, which
-- ruleset produced it, and whether it is worth producing again.
--
-- Still deliberately NOT created (M2 has no AI): embeddings, vector
-- columns, chunks, topics, entities, collections, graph edges,
-- recommendations, audio, research, agent tables.
-- ================================================================

-- ---- the archive -------------------------------------------------
-- The bytes a publisher actually served us, and the only thing in the
-- system that cannot be recomputed.
--
-- The DOCUMENT ITSELF IS NOT HERE. Raw pages are 50 KB–10 MB, are
-- written once and read rarely, and would bloat every backup, restore
-- and replica for no queryable gain. This table holds the metadata —
-- small, transactional, joinable — and the object store holds the
-- bytes (lib/knowledge/storage). This row is the source of truth
-- about what exists: a blob with no row is garbage, not content.
CREATE TABLE IF NOT EXISTS knowledge_artifacts (
  id                  TEXT PRIMARY KEY,
  object_id           TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  org_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- 'raw_html' is the only kind M2 writes. The column exists so that
  -- a PDF, a transcript or a screenshot is a new value rather than a
  -- new table.
  kind                TEXT NOT NULL DEFAULT 'raw_html',

  -- Which backend wrote it. Recorded per artifact, so a deployment
  -- can migrate from disk to S3 without stranding what it already has.
  storage_backend     TEXT NOT NULL,
  storage_key         TEXT NOT NULL,

  content_type        TEXT NOT NULL,          -- as served, e.g. text/html
  content_encoding    TEXT NOT NULL,          -- 'gzip' | 'identity' AT REST
  charset             TEXT,                   -- as declared by the publisher

  byte_size           BIGINT NOT NULL,        -- stored (compressed) size
  original_byte_size  BIGINT NOT NULL,        -- size of the bytes as fetched
  -- sha256 of the UNCOMPRESSED bytes. Verified on every read, so a
  -- corrupted or truncated archive is detected rather than re-parsed;
  -- also what lets a re-fetch recognise unchanged content.
  checksum            CHAR(64) NOT NULL,

  -- Provenance of the fetch, kept with the bytes rather than only on
  -- the object, because the object's own columns move on with each
  -- re-fetch and this row must stay true to its moment.
  fetched_at          BIGINT NOT NULL,
  requested_url       TEXT NOT NULL,
  resolved_url        TEXT,
  http_status         SMALLINT,

  created_at          BIGINT NOT NULL,
  -- Soft delete: retention marks a row before the blob is collected,
  -- so a half-finished cleanup can never look like a lost artifact.
  deleted_at          BIGINT,

  CONSTRAINT knowledge_artifacts_kind_check
    CHECK (kind IN ('raw_html')),
  CONSTRAINT knowledge_artifacts_encoding_check
    CHECK (content_encoding IN ('gzip', 'identity')),
  CONSTRAINT knowledge_artifacts_backend_check
    CHECK (storage_backend IN ('filesystem', 's3'))
);

-- "the newest surviving artifact for this object" — the reprocessing
-- entry point, and by far the most common read.
CREATE INDEX IF NOT EXISTS idx_knowledge_artifacts_object
  ON knowledge_artifacts (object_id, fetched_at DESC)
  WHERE deleted_at IS NULL;

-- Tenant-scoped listing, and the prefix a workspace deletion walks.
CREATE INDEX IF NOT EXISTS idx_knowledge_artifacts_org
  ON knowledge_artifacts (org_id, created_at DESC);

-- The retention sweep's index: rows marked for collection.
CREATE INDEX IF NOT EXISTS idx_knowledge_artifacts_deleted
  ON knowledge_artifacts (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Re-archiving the same fetch must be idempotent: a retried job that
-- already stored its bytes updates nothing rather than duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_artifacts_dedupe
  ON knowledge_artifacts (object_id, kind, checksum)
  WHERE deleted_at IS NULL;

-- ---- extraction provenance ---------------------------------------
-- M1 recorded a single opaque `extractor` string. M2 splits it into
-- the parts that re-extraction actually needs to reason about: what
-- ran, which version of it, whether a site-specific rule matched, and
-- how good the result looked. All nullable — an M1 row simply has not
-- been re-extracted yet, which is exactly what these NULLs mean.
ALTER TABLE knowledge_content ADD COLUMN IF NOT EXISTS artifact_id            TEXT REFERENCES knowledge_artifacts(id) ON DELETE SET NULL;
ALTER TABLE knowledge_content ADD COLUMN IF NOT EXISTS extraction_method      TEXT;
ALTER TABLE knowledge_content ADD COLUMN IF NOT EXISTS extractor_version      TEXT;
ALTER TABLE knowledge_content ADD COLUMN IF NOT EXISTS extraction_confidence  REAL;
ALTER TABLE knowledge_content ADD COLUMN IF NOT EXISTS site_config_matched    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE knowledge_content ADD COLUMN IF NOT EXISTS images                 TEXT[] NOT NULL DEFAULT '{}';
-- Bumped on every successful re-extraction. The reader uses it to tell
-- "this article changed" from "this article was re-read".
ALTER TABLE knowledge_content ADD COLUMN IF NOT EXISTS revision               INTEGER NOT NULL DEFAULT 1;

-- Which stored articles are stale for a given extractor version — the
-- query a future "re-extract everything graby can now do better" runs.
CREATE INDEX IF NOT EXISTS idx_knowledge_content_version
  ON knowledge_content (org_id, extractor_version);

-- The publisher's own idea of this page's address, which legitimately
-- differs from the URL we fetched (syndication, AMP, share links).
-- Kept separate from canonical_url, which is OUR normalisation and is
-- what duplicate detection keys on.
ALTER TABLE knowledge_objects ADD COLUMN IF NOT EXISTS publisher_canonical_url TEXT;

-- ---- job kinds ----------------------------------------------------
-- M1 wrote only 'ingest'. M2 adds exactly the kinds it needs and no
-- speculative ones:
--   reextract  re-run extraction from an ARCHIVED artifact; no fetch
--   cleanup    collect blobs whose rows retention has released
-- The column already exists and is unconstrained, so this adds the
-- check that was missing rather than widening one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_jobs_kind_check'
  ) THEN
    ALTER TABLE knowledge_jobs
      ADD CONSTRAINT knowledge_jobs_kind_check
      CHECK (kind IN ('ingest', 'reextract', 'cleanup'));
  END IF;
END $$;

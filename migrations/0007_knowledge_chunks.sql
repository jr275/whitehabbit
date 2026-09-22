-- ================================================================
-- 0007_knowledge_chunks.sql — the retrieval substrate: content
-- hashing and deterministic chunks.
--
-- WHAT THIS IS FOR. Retrieval does not work on documents, it works
-- on passages. An answer that cites "this article" is not grounded;
-- an answer that cites the sentence it drew from is. This table is
-- what makes the second possible, and it is the only new storage
-- this migration adds — the embeddings that sit on top of these
-- chunks are a separate concern with a separate migration, because
-- their column type depends on a provider decision this one does
-- not need to know about.
--
-- knowledge_items IS UNCHANGED except for one added column. It stays
-- the single UI-facing source of truth (status/content_text/etc.)
-- exactly as it is today; chunks are a derived index underneath it,
-- and can be dropped and rebuilt from content_text at any time
-- without losing anything a user saved.
--
-- Follows the conventions 0002 and 0006 established: BIGINT epoch-
-- millisecond timestamps (Date.now(), never TIMESTAMPTZ/now()),
-- prefixed TEXT ids, org-scoped by a NOT NULL org_id FK, and no CHECK
-- on free-form text columns.
--
-- Migrations 0001-0006 are untouched. Every statement here is
-- idempotent: re-running this file is a no-op.
-- ================================================================

-- ---- knowledge_items.content_hash ------------------------------
--
-- sha256 of the extracted content_text. It answers one question
-- cheaply and exactly: has the text changed since we last chunked
-- it? Without it, deciding whether to re-chunk means either
-- re-chunking every item on every pass, or comparing whole
-- documents. It is nullable because every row that exists today
-- predates it — backfill is the indexer's job, not this migration's,
-- so this file stays instant on a large table (ADD COLUMN with no
-- default and no rewrite).
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS content_hash CHAR(64);

-- ---- knowledge_chunks ------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              TEXT PRIMARY KEY,          -- "knc_..." — derived, see the unique index below

  -- Ownership is MIRRORED from the parent item rather than reached
  -- through a join. That is a deliberate denormalisation and the one
  -- place in this schema where a fact is stored twice: every
  -- retrieval query filters on (org_id, created_by), and a retrieval
  -- path whose authorization depends on remembering to join is a
  -- retrieval path that will eventually leak. Here the filter is on
  -- the row being read. The columns mirror knowledge_items exactly
  -- (org_id NOT NULL + cascade, created_by nullable + no cascade), so
  -- the two can never disagree about what is deletable.
  item_id         TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      TEXT REFERENCES users(id),

  ordinal         INTEGER NOT NULL,          -- 0-based position within the item; reading order
  text            TEXT NOT NULL,             -- the passage itself — what a citation quotes

  -- Offsets back into knowledge_items.content_text. These are what
  -- let a citation point at a span of the original rather than at a
  -- copy of it, so the Reader can highlight the exact passage an
  -- answer used. Nullable because a future chunker (a PDF, a
  -- transcript) may legitimately not have character offsets into a
  -- plain-text field, and an honest NULL beats a fabricated 0.
  char_start      INTEGER,
  char_end        INTEGER,

  token_estimate  INTEGER,                   -- for context budgeting; an estimate, never billed against
  content_hash    CHAR(64) NOT NULL,         -- sha256 of `text` — dedupe of overlapping passages at assembly time

  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,

  CONSTRAINT knowledge_chunks_ordinal_check    CHECK (ordinal >= 0),
  -- A span may be empty (start = end) but never inverted. Both-or-
  -- neither: half a span is a bug that would silently produce a
  -- citation pointing at nothing.
  CONSTRAINT knowledge_chunks_span_check       CHECK (
    (char_start IS NULL AND char_end IS NULL)
    OR (char_start IS NOT NULL AND char_end IS NOT NULL AND char_end >= char_start AND char_start >= 0)
  ),
  CONSTRAINT knowledge_chunks_token_check      CHECK (token_estimate IS NULL OR token_estimate >= 0)
);

-- THE identity constraint: one chunk per position per item. This is
-- what makes re-indexing idempotent — the indexer upserts on
-- (item_id, ordinal) and a re-run overwrites in place instead of
-- accumulating a second copy of the document. It also serves every
-- "give me this item's chunks in order" read as a prefix scan, which
-- is why there is deliberately NO separate index on item_id alone:
-- it would be redundant with this one's leading column and cost
-- writes for nothing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_chunks_item_ordinal
  ON knowledge_chunks (item_id, ordinal);

-- The authorization filter every retrieval query starts from. Its
-- selectivity inside a single org is low, so this is not the index
-- that makes search fast — the lexical and vector indexes in the
-- next migrations do that. It exists so the scope filter can be
-- satisfied from an index rather than by reading the table, and so
-- the planner has a usable path for the "everything this user owns"
-- scans the indexer and the related-items query both need.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_scope
  ON knowledge_chunks (org_id, created_by);

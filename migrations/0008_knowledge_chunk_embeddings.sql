-- ================================================================
-- 0008_knowledge_chunk_embeddings.sql — semantic retrieval storage.
--
-- WHY THE DIMENSION IS 768, AND WHY THAT IS A DECISION RATHER THAN
-- A GUESS.
--
-- A vector column has to name its width at DDL time, and an HNSW
-- index cannot be built without it. Two measured facts bound the
-- choice, and one provider fact removes the rest of the uncertainty:
--
--   1. pgvector 0.6.0 refuses an HNSW index above 2000 dimensions
--      ("column cannot have more than 2000 dimensions for hnsw
--      index" — measured, not recalled). halfvec, which raises that
--      ceiling, arrives in 0.7.0 and does not exist in 0.6.0.
--   2. Gemini's embedding API takes `outputDimensionality`, which
--      the official @google/genai SDK documents as: "Reduced
--      dimension for the output embedding. If set, excessive values
--      in the output embedding are truncated from the end." So the
--      stored width is something WE choose, not something the model
--      dictates — the SDK's own example passes 64.
--
-- 768 sits well inside both bounds, is a width every embedding model
-- in that family can produce by truncation, and leaves headroom to
-- move up later without touching the 2000 ceiling. The cost is real
-- and worth naming: truncating a wider native embedding loses some
-- retrieval quality. That trade is revisitable — see below.
--
-- THIS IS ENFORCED, NOT ASSUMED. `dimensions` records the width of
-- each row and a CHECK ties it to the vector actually stored, so a
-- provider or configuration change that starts emitting a different
-- width fails at write time with a constraint violation, loudly and
-- immediately, instead of silently poisoning the index with vectors
-- that cannot be compared to their neighbours.
--
-- CHANGING THE WIDTH LATER is a new migration, not an edit to this
-- one: a new column (or table) at the new width, backfill, swap
-- reads, drop the old. `provider`/`model`/`dimensions` exist so that
-- re-indexing can be driven by a query — "everything not on the
-- current model" — rather than by rebuilding the whole library.
--
-- Idempotent, additive, and touching nothing that already exists.
-- ================================================================

-- Neon supports pgvector, but the role running migrations must be
-- allowed to create the extension. If this line fails on permissions,
-- that is the finding — do not work around it with a fallback
-- representation; application-side similarity does not scale and was
-- explicitly ruled out.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
  -- One embedding per chunk, so the chunk id IS the key. Re-embedding
  -- a chunk overwrites in place; there is no version fan-out to
  -- garbage-collect, and no way to end up with two live vectors for
  -- one passage silently disagreeing about what it means.
  chunk_id      TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,

  -- Scope mirrored again, for the same reason it is mirrored onto the
  -- chunk: this is the hottest query in the product, and an ANN scan
  -- that reaches authorization through a join is one refactor away
  -- from returning a neighbour that belongs to someone else. Here the
  -- filter sits on the row the index is built over.
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by    TEXT REFERENCES users(id),

  embedding     vector(768) NOT NULL,

  -- Provenance of the vector. Without these, re-indexing after a
  -- model change means re-embedding everything, because nothing
  -- records what produced what.
  provider      TEXT NOT NULL,             -- "gemini"
  model         TEXT NOT NULL,             -- exact model id as sent to the provider
  dimensions    INTEGER NOT NULL,

  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL,

  -- The self-check described above: the recorded width must be the
  -- stored width. vector_dims() is immutable, so this is valid in a
  -- CHECK and is evaluated on every write.
  CONSTRAINT knowledge_chunk_embeddings_dims_check
    CHECK (dimensions = vector_dims(embedding))
);

-- The ANN index. Cosine distance because these are direction-carrying
-- text embeddings whose magnitude is not meaningful; the operator
-- class must match the operator the query uses (<=>), or the index is
-- silently ignored and every search degrades to a sequential scan.
--
-- Built with defaults (m=16, ef_construction=64) deliberately: tuning
-- them is a measurement exercise against real recall on real data,
-- and picking non-default values now would be guessing at a shape the
-- library does not have yet. Phase D revisits this with numbers.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_embeddings_hnsw
  ON knowledge_chunk_embeddings USING hnsw (embedding vector_cosine_ops);

-- Backs the authorization filter, and the "which rows are on an old
-- model" scan that re-indexing needs.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_embeddings_scope
  ON knowledge_chunk_embeddings (org_id, created_by);

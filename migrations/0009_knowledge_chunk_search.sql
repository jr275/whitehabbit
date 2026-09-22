-- ================================================================
-- 0009_knowledge_chunk_search.sql — lexical retrieval over chunks.
--
-- WHAT THIS REPLACES. Search today is `content_text ILIKE '%q%'`
-- over whole items (lib/knowledge/repo.ts searchItems). That has no
-- index to use, so it reads every row the tenant owns; it cannot
-- rank beyond a hand-written CASE; and it matches substrings rather
-- than words, so "art" hits "smart". A tsvector with a GIN index
-- fixes all three, and does it at the chunk level so a hit points at
-- the passage rather than the document.
--
-- WHY 'simple' AND NOT 'english'.
--
-- A stemmer is a bet on the language of the text. This library holds
-- whatever its owner saved — English and Portuguese in the same
-- account is the expected case, not the exotic one — and
-- to_tsvector('english', …) on Portuguese prose stems by English
-- rules, producing tokens that match neither language properly.
-- There is no single correct stemmer for a mixed corpus, and picking
-- per row would mean each row carrying its own configuration, which
-- a single query predicate then cannot match against.
--
-- 'simple' declines the bet: it lowercases and splits on word
-- boundaries, and does not stem or drop stopwords. It never stems
-- WRONGLY. What it gives up is morphological recall — "failure" will
-- not match "failures" — and that loss is precisely what the
-- semantic half of hybrid retrieval exists to cover. Lexical for
-- exactness, vectors for meaning; asking the lexical half to also
-- guess morphology across languages is what makes it unreliable at
-- both.
--
-- A GENERATED column rather than a trigger or an application write:
-- it cannot drift from `text`, cannot be forgotten by a new insert
-- path, and needs no backfill of its own. to_tsvector with an
-- explicit configuration is IMMUTABLE, which is what makes this
-- legal as a generated expression at all (the one-argument form is
-- not, because it depends on a session setting).
--
-- Additive and idempotent. Nothing existing changes behaviour: the
-- old searchItems path keeps working untouched until the retrieval
-- layer replaces it.
-- ================================================================

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED;

-- GIN is the right index for a tsvector that is read far more often
-- than written: slower to build and update than GiST, substantially
-- faster to search, and chunks are written once per indexing pass
-- and then queried on every search.
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search
  ON knowledge_chunks USING gin (search_vector);

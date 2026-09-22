-- ================================================================
-- 0010_knowledge_concepts.sql — machine-derived concepts, and the
-- provenance that makes them answerable for.
--
-- WHAT THIS IS FOR. The library already knows what a person saved
-- (knowledge_items), what it says (knowledge_chunks) and how it
-- reads semantically (knowledge_chunk_embeddings). What it cannot do
-- is name what a document is ABOUT in terms that survive across
-- documents. Two articles that both discuss agent tool use share no
-- row today; the only thing tying them together is that their
-- embeddings happen to sit near each other, which is a similarity,
-- not a subject.
--
-- These two tables are the smallest structure that fixes that, and
-- deliberately no more. There is no ontology here: no hierarchy, no
-- typed relations between concepts, no inference. A concept is a
-- normalised name with a type; an association says a concept was
-- found in an item, by what process, with what confidence, and in
-- which passages. Everything a product might later build on this —
-- related items, clustering, gaps, contradictions — is derivable
-- from those two facts without another migration.
--
-- CONCEPTS ARE NOT TAGS, and the two must never be merged.
-- knowledge_item_tags holds labels a PERSON chose; those are
-- authorial and are never rewritten by a machine. These tables hold
-- what a MACHINE derived, always carrying its own provenance so it
-- can be shown, doubted, or thrown away without touching anything
-- the user wrote.
--
-- Follows the conventions 0002/0006/0007 established: BIGINT epoch-
-- millisecond timestamps (Date.now(), never now()), prefixed TEXT
-- ids, org-scoped by a NOT NULL org_id FK with created_by mirrored
-- alongside it, and no CHECK on free-form text.
--
-- Migrations 0001-0009 are untouched. Every statement is idempotent.
-- ================================================================

-- ---- knowledge_concepts ----------------------------------------
--
-- One row per distinct subject, per owner. Not global: two people
-- who both save about "MCP" get their own concept row, because a
-- shared concept table would be a cross-tenant join waiting to be
-- written, and because a concept's item counts are only meaningful
-- inside one library anyway.
CREATE TABLE IF NOT EXISTS knowledge_concepts (
  id               TEXT PRIMARY KEY,          -- "knc_c..."

  -- Ownership mirrored exactly as knowledge_chunks does it, and for
  -- the same reason: every read filters on (org_id, created_by), and
  -- an authorization that depends on remembering to join is one that
  -- eventually leaks. Same nullability and cascade rules as
  -- knowledge_items so the two can never disagree about deletability.
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by       TEXT REFERENCES users(id),

  -- The name as it should be SHOWN — first spelling seen wins, so
  -- "MCP" stays "MCP" and does not become "mcp" in the UI.
  canonical_name   TEXT NOT NULL,

  -- The name as it is COMPARED. Deterministic, computed in
  -- lib/knowledge/concepts/normalize.ts, and the sole basis for
  -- deduplication — see the unique index below. No model decides
  -- whether two concepts are the same thing.
  normalized_name  TEXT NOT NULL,

  -- Small, closed vocabulary. Enforced here rather than in code
  -- alone because a bad type would silently partition a concept into
  -- two rows that the unique index below is trying to keep as one.
  concept_type     TEXT NOT NULL DEFAULT 'CONCEPT',

  description      TEXT,                      -- optional one-liner; nullable, never fabricated

  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL,

  CONSTRAINT knowledge_concepts_type_check CHECK (
    concept_type IN ('TOPIC', 'CONCEPT', 'ENTITY', 'TECHNOLOGY', 'PERSON', 'ORGANIZATION', 'PRODUCT')
  ),
  CONSTRAINT knowledge_concepts_name_check CHECK (
    length(canonical_name) > 0 AND length(normalized_name) > 0
  )
);

-- THE DEDUPLICATION RULE, in one line.
--
-- (owner, normalized_name) is unique, so "AI", "A.I." and
-- "Artificial  Intelligence" collapse to whatever normalize() maps
-- them to, and a concurrent extraction of the same document cannot
-- mint two rows for one subject. COALESCE because created_by is
-- nullable and NULLs do not collide in a plain unique index — an
-- unowned row must still deduplicate against other unowned rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_concepts_owner_name
  ON knowledge_concepts (org_id, COALESCE(created_by, ''), normalized_name);

-- The listing path: every concept for one owner, newest first.
CREATE INDEX IF NOT EXISTS idx_knowledge_concepts_scope
  ON knowledge_concepts (org_id, created_by, updated_at DESC);

-- ---- knowledge_item_concepts -----------------------------------
--
-- The association, and the provenance. A row here is a claim that a
-- concept was found in an item; it carries who made the claim
-- (source), how sure it was (confidence), and where in the document
-- it came from (evidence). A claim without those three is an
-- assertion nobody can check, which is exactly what this product
-- must not ship.
CREATE TABLE IF NOT EXISTS knowledge_item_concepts (
  id              TEXT PRIMARY KEY,           -- "knc_a..."

  item_id         TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  concept_id      TEXT NOT NULL REFERENCES knowledge_concepts(id) ON DELETE CASCADE,

  -- Mirrored again, same reasoning. It also means a cross-owner
  -- association is refusable by the row's own columns rather than by
  -- a join through two parents.
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      TEXT REFERENCES users(id),

  -- WHAT PROCESS produced this. 'llm' is a model extraction; 'rule'
  -- is deterministic (a title match, a heading); 'user' is a person
  -- confirming or adding one. Kept open-ended in code but closed
  -- here, so an unrecognised writer cannot invent a provenance.
  source          TEXT NOT NULL,

  -- 0..1. NOT NULL: "we do not know how sure we are" is not a state
  -- this table permits, because the UI would then have to decide
  -- what to show and would end up inventing something.
  confidence      REAL NOT NULL,

  -- References into knowledge_chunks, not copies of their text. The
  -- passage already exists exactly once; duplicating it here would
  -- let evidence drift out of sync with the document it quotes.
  -- Shape: [{"chunkId": "..."}] — validated in code before it lands.
  evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at      BIGINT NOT NULL,

  CONSTRAINT knowledge_item_concepts_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT knowledge_item_concepts_source_check     CHECK (source IN ('llm', 'rule', 'user')),
  CONSTRAINT knowledge_item_concepts_evidence_check   CHECK (jsonb_typeof(evidence) = 'array')
);

-- One association per (item, concept). A re-extraction updates the
-- existing row rather than stacking duplicates, which is what makes
-- re-running extraction safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_item_concepts_pair
  ON knowledge_item_concepts (item_id, concept_id);

-- "What is this item about?" — the item detail and Related lookups.
CREATE INDEX IF NOT EXISTS idx_knowledge_item_concepts_item
  ON knowledge_item_concepts (org_id, created_by, item_id);

-- "Which items mention this concept?" — the reverse, and the basis
-- of shared-concept relatedness. Ordered by confidence so the
-- strongest associations are read first and a LIMIT is meaningful.
CREATE INDEX IF NOT EXISTS idx_knowledge_item_concepts_concept
  ON knowledge_item_concepts (org_id, created_by, concept_id, confidence DESC);

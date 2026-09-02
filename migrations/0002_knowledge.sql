-- ================================================================
-- 0002_knowledge.sql — the Knowledge product's real persistence.
--
-- Follows every convention established by 0001_init.sql: BIGINT epoch-
-- millisecond timestamps, prefixed TEXT ids ("kn_..."), org-scoped by
-- a NOT NULL org_id FK, JSONB for the still-evolving bits. This is the
-- ONE Knowledge table — there is no second store, no duplicate auth,
-- no separate database. Rows are written only by the ingestion
-- pipeline (lib/knowledge/service.ts) from really-fetched content.
--
-- A saved item moves through an explicit, honest state machine:
--   saved -> fetching -> extracting -> ready | failed
-- No fabricated "AI understanding" phases — those states only exist
-- once a real AI pipeline does. `archived` and `favorite` are flags,
-- not states, so an item keeps its lifecycle state while filed away.
-- ================================================================

CREATE TABLE IF NOT EXISTS knowledge_items (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by     TEXT REFERENCES users(id),

  -- what the user saved
  url            TEXT NOT NULL,             -- the exact URL the user submitted
  canonical_url  TEXT,                      -- <link rel=canonical> / og:url when extraction finds one
  domain         TEXT,                      -- host, for display + grouping ("theverge.com")

  -- lifecycle
  status         TEXT NOT NULL DEFAULT 'saved', -- saved | fetching | extracting | ready | failed
  kind           TEXT NOT NULL DEFAULT 'article', -- article | video | pdf | podcast | social | document
  error          TEXT,                      -- human-readable failure reason when status = failed
  attempts       INTEGER NOT NULL DEFAULT 0, -- how many ingestion attempts have run (retry increments)

  -- extracted presentation metadata (all NULL until extraction succeeds)
  title          TEXT,
  author         TEXT,
  site_name      TEXT,                      -- publication name ("The Verge")
  excerpt        TEXT,                      -- short human description (meta description / og:description)
  image_url      TEXT,                      -- lead image (og:image) — remote URL, rendered with crossOrigin
  published_at   BIGINT,                    -- article publish time when the page exposes one
  word_count     INTEGER,
  reading_min    INTEGER,                   -- derived from word_count (~225 wpm)
  lang           TEXT,

  -- extracted content
  content_text   TEXT,                      -- clean, readable plain text (paragraph-separated) — what the Reader renders
  summary        TEXT,                      -- reserved for a future real AI summary; NULL until that pipeline exists

  -- raw archival — enables real re-extraction without re-fetching
  raw_html       TEXT,
  raw_fetched_at BIGINT,

  -- user state
  favorite       BOOLEAN NOT NULL DEFAULT FALSE,
  archived       BOOLEAN NOT NULL DEFAULT FALSE,
  read_at        BIGINT,                    -- set the first time the Reader opens a ready item

  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_org ON knowledge_items(org_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_org_created ON knowledge_items(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_items(status);

-- Tags/topics are derived by extraction (meta keywords, article:tag).
-- A normalized side table keeps them queryable for the Topics surface
-- without reshaping the item row on every extraction.
CREATE TABLE IF NOT EXISTS knowledge_item_tags (
  item_id  TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  org_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (item_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags_org ON knowledge_item_tags(org_id, tag);

-- ================================================================
-- 0003_knowledge_dedupe.sql — duplicate detection + source favicon.
--
-- Adds two columns to the ONE knowledge table (no new store):
--
--   normalized_url  a stable canonical dedup key (see lib/knowledge/
--                   url.ts) computed at save time from the submitted
--                   URL — trailing slash + tracking params stripped,
--                   host lowercased, query sorted. The exact submitted
--                   URL still lives in `url`; this is only for "have I
--                   already saved this?" matching, never for display.
--
--   favicon         the source site's icon URL (apple-touch-icon /
--                   <link rel=icon> / origin /favicon.ico), extracted
--                   from real markup. Shown as the small source glyph
--                   next to the domain; NULL falls back to the kind
--                   icon, never a fabricated asset.
--
-- Existing rows keep normalized_url = NULL. A partial unique index
-- treats NULLs as distinct, so legacy items simply don't participate
-- in dedup (they never conflict); every NEW save is deduped among the
-- org's active items. The index is the race-safe backstop behind the
-- service layer's read-then-insert check.
-- ================================================================

ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS normalized_url TEXT;
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS favicon        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_org_normalized
  ON knowledge_items (org_id, normalized_url)
  WHERE archived = FALSE AND normalized_url IS NOT NULL;

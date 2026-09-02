-- ================================================================
-- 0005_knowledge_user_scope.sql — S5: the library is private per
-- user, not just per organization.
--
-- Every application-level read (listItems, getItem, searchItems,
-- getTags, ...) is now scoped by (org_id, created_by), not org_id
-- alone. But uq_knowledge_org_normalized (0004_knowledge_dedupe.sql)
-- enforced uniqueness on (org_id, normalized_url) ALONE — meaning the
-- database itself forced two different users in the same org to share
-- one active row for the same canonical URL, no matter what the
-- application layer checked. A second colleague's genuinely new save
-- of a page a colleague already saved would raise a real duplicate-key
-- error from this index; saveUrl's own recovery path re-runs
-- findByNormalizedUrl scoped to the CALLING user, correctly finds
-- nothing (it is not their row), and the error propagates uncaught —
-- a 500 for a save that should have simply succeeded as a new item.
--
-- Fixes it at the same boundary the bug lives at: the uniqueness
-- constraint moves from (org_id, normalized_url) to (org_id,
-- created_by, normalized_url). Two colleagues who save the same public
-- page each get their own row; the SAME user saving the same page
-- twice still collides, exactly as before.
--
-- Purely a boundary fix on an existing constraint — no column added,
-- no table created, no data touched, migrations 0001-0004 untouched.
-- created_by is already NOT NULL-enforced in practice (every real
-- save goes through the one authenticated path, which always supplies
-- it); a hypothetical NULL created_by row is not deduplicated against
-- anything by a multi-column unique index (standard SQL: NULL never
-- equals NULL for uniqueness) — strictly safer than the bug this
-- fixes, never a new way to collide two different owners' items.
-- ================================================================

DROP INDEX IF EXISTS uq_knowledge_org_normalized;

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_org_user_normalized
  ON knowledge_items (org_id, created_by, normalized_url)
  WHERE archived = FALSE AND normalized_url IS NOT NULL;

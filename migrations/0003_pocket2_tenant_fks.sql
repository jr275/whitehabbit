-- ================================================================
-- 0003_pocket2_tenant_fks.sql
--
-- Closes two tenant-isolation gaps found by the Phase 2 security
-- checkpoint, both confirmed by attempting the write with raw SQL
-- against a live database (the API layer was bypassed entirely).
--
-- The invariant 0002 set out to enforce is that EVERY foreign key
-- between tenant-owned rows is composite on (id, org_id), so a child
-- row can never be attached to a parent in another organization even
-- if an application-layer predicate is missing. Two tables did not
-- meet it.
-- ================================================================

-- ---- FINDING DB-01 (MEDIUM) -------------------------------------
-- audio_segment_marks.segment_id referenced reader_segments(id)
-- ALONE. Organization B's audio asset could therefore be linked to
-- organization A's reader segment — the exact cross-tenant
-- attachment every other table in the schema refuses.
--
-- Latent rather than live: audio generation is Phase 6, so nothing
-- writes this table yet. Fixed now precisely because it is cheap
-- while the table is empty, and because a schema that permits the
-- write is a bug whether or not code currently performs it.
--
-- reader_segments needs the composite unique key first: a composite
-- foreign key must target a uniquely-constrained column pair.
ALTER TABLE reader_segments
  ADD CONSTRAINT uq_reader_segments_id_org UNIQUE (id, org_id);

ALTER TABLE audio_segment_marks
  DROP CONSTRAINT IF EXISTS audio_segment_marks_segment_id_fkey;

ALTER TABLE audio_segment_marks
  ADD CONSTRAINT fk_marks_segment
  FOREIGN KEY (segment_id, org_id)
  REFERENCES reader_segments(id, org_id) ON DELETE CASCADE;

-- ---- FINDING DB-02 (LOW) ----------------------------------------
-- item_events.item_id had NO foreign key at all. Two consequences:
-- an event row could name another tenant's item id, and deleting an
-- item left its events behind as orphans pointing at an id that no
-- longer exists.
--
-- ON DELETE SET NULL (item_id) rather than CASCADE: these rows are
-- the product's activity record, and "an item was saved and later
-- deleted" is exactly the kind of thing an activity log should still
-- be able to say.
--
-- The column list is essential, not decorative. A bare SET NULL on a
-- COMPOSITE key nulls every column in it, including org_id — which is
-- NOT NULL, so deleting any item would fail outright. Naming the
-- column (PostgreSQL 15+) nulls only the reference and leaves the
-- surviving row correctly scoped to its tenant. Caught by the
-- regression test in tests/integration/tenant-schema.test.ts.
--
-- Existing rows are cleaned first, since a pre-existing orphan would
-- make the constraint unvalidatable.
UPDATE item_events e
   SET item_id = NULL
 WHERE e.item_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM saved_items i WHERE i.id = e.item_id AND i.org_id = e.org_id
   );

ALTER TABLE item_events
  ADD CONSTRAINT fk_item_events_item
  FOREIGN KEY (item_id, org_id)
  REFERENCES saved_items(id, org_id) ON DELETE SET NULL (item_id);

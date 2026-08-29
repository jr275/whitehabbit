import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closePool, createTenant, hasDatabase, migrate, resetPocket2, testPool, type Tenant } from "../support/db"
import { saveItem } from "@/lib/pocket2/repo/items"

/* ================================================================== *
 * TENANT ISOLATION AT THE STORAGE LAYER
 *
 * Added by the Phase 2 security checkpoint. Every attempt below is
 * made with RAW SQL against a live database — the API, the service
 * layer and the repository are all bypassed, because the question
 * these tests answer is "what does the DATABASE refuse?", not "what
 * does our code remember to check?".
 *
 * Two of these were ACCEPTED before migration 0003.
 * ================================================================== */

const describeDb = hasDatabase ? describe : describe.skip

/** Every table that holds tenant-owned Pocket2 data. */
const TENANT_TABLES = [
  "saved_items", "saved_item_states", "reader_documents", "reader_segments",
  "audio_assets", "audio_segment_marks", "collections", "collection_items",
  "tags", "saved_item_tags", "ingest_jobs", "item_events",
]

describeDb("every tenant-owned table carries org_id", () => {
  beforeAll(async () => { await migrate() })
  afterAll(async () => { await closePool() })

  it("has an org_id column on all of them", async () => {
    const { rows } = await testPool().query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name='org_id' AND table_name = ANY($1::text[])`,
      [TENANT_TABLES],
    )
    expect(rows.map((r) => r.table_name).sort()).toEqual([...TENANT_TABLES].sort())
  })

  it("makes every foreign key between tenant-owned rows composite on org_id", async () => {
    // A non-composite FK is how a child row ends up attached to a
    // parent in another organization. Only references to shared
    // top-level tables (organizations, users) are legitimately simple.
    const { rows } = await testPool().query<{ child: string; parent: string; cols: string }>(
      `SELECT cl.relname AS child, ref.relname AS parent,
              (SELECT string_agg(a.attname, ',' ORDER BY x.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=x.attnum) AS cols
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid=con.conrelid
         JOIN pg_class ref ON ref.oid=con.confrelid
        WHERE con.contype='f' AND cl.relname = ANY($1::text[])
          AND ref.relname NOT IN ('organizations','users')`,
      [TENANT_TABLES],
    )
    expect(rows.length).toBeGreaterThan(0)
    const nonComposite = rows.filter((r) => !r.cols.split(",").includes("org_id"))
    expect(
      nonComposite.map((r) => `${r.child}(${r.cols}) -> ${r.parent}`),
      "these foreign keys allow cross-tenant attachment",
    ).toEqual([])
  })
})

describeDb("the database refuses cross-tenant attachment", () => {
  let a: Tenant
  let b: Tenant
  let itemA: string

  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })

  beforeEach(async () => {
    await resetPocket2()
    a = await createTenant("schemaA")
    b = await createTenant("schemaB")
    itemA = (await saveItem(a.orgId, a.userId, "https://example.com/a")).item.id
    const itemB = (await saveItem(b.orgId, b.userId, "https://example.com/b")).item.id

    await testPool().query(
      `INSERT INTO reader_documents (id,item_id,org_id,extraction_status,extractor_version,extracted_at)
       VALUES ('rdoc_a',$1,$2,'ok','v',1)`, [itemA, a.orgId])
    await testPool().query(
      `INSERT INTO reader_segments (id,document_id,org_id,ordinal,kind,text,char_start,char_end)
       VALUES ('seg_a','rdoc_a',$1,0,'paragraph','confidential',0,12)`, [a.orgId])
    await testPool().query(
      `INSERT INTO audio_assets (id,item_id,org_id,status,created_at,updated_at)
       VALUES ('aud_b',$1,$2,'ready',1,1)`, [itemB, b.orgId])
    await testPool().query(
      `INSERT INTO collections (id,org_id,name,slug,created_at,updated_at) VALUES ('coll_b',$1,'B','b',1,1)`, [b.orgId])
    await testPool().query(
      `INSERT INTO tags (id,org_id,name,slug,created_at) VALUES ('tag_b',$1,'T','t',1)`, [b.orgId])
  })

  const refuses = async (label: string, sql: string, params: unknown[]) => {
    await expect(testPool().query(sql, params), label).rejects.toThrow(/foreign key|violates/i)
  }

  it("refuses a reader document for another tenant's item", async () => {
    await refuses("reader_documents",
      `INSERT INTO reader_documents (id,item_id,org_id,extraction_status,extractor_version,extracted_at)
       VALUES ('x',$1,$2,'ok','v',1)`, [itemA, b.orgId])
  })

  it("refuses a reader segment on another tenant's document", async () => {
    await refuses("reader_segments",
      `INSERT INTO reader_segments (id,document_id,org_id,ordinal,kind,text,char_start,char_end)
       VALUES ('x','rdoc_a',$1,9,'paragraph','t',0,1)`, [b.orgId])
  })

  it("refuses per-user state on another tenant's item", async () => {
    await refuses("saved_item_states",
      `INSERT INTO saved_item_states (item_id,user_id,org_id,created_at,updated_at) VALUES ($1,$2,$3,1,1)`,
      [itemA, b.userId, b.orgId])
  })

  it("refuses an ingestion job for another tenant's item", async () => {
    await refuses("ingest_jobs",
      `INSERT INTO ingest_jobs (id,item_id,org_id,kind,status,next_attempt_at,created_at,updated_at)
       VALUES ('x',$1,$2,'metadata','queued',1,1,1)`, [itemA, b.orgId])
  })

  it("refuses filing another tenant's item into a collection", async () => {
    await refuses("collection_items",
      `INSERT INTO collection_items (collection_id,item_id,org_id,added_at) VALUES ('coll_b',$1,$2,1)`,
      [itemA, b.orgId])
  })

  it("refuses tagging another tenant's item", async () => {
    await refuses("saved_item_tags",
      `INSERT INTO saved_item_tags (item_id,tag_id,org_id,added_at) VALUES ($1,'tag_b',$2,1)`,
      [itemA, b.orgId])
  })

  it("refuses linking audio to another tenant's segment (DB-01)", async () => {
    // REGRESSION: accepted before migration 0003 — audio_segment_marks
    // referenced reader_segments(id) alone rather than (id, org_id).
    await refuses("audio_segment_marks",
      `INSERT INTO audio_segment_marks (asset_id,segment_id,org_id,start_ms,end_ms)
       VALUES ('aud_b','seg_a',$1,0,1)`, [b.orgId])
  })

  it("refuses an activity event naming another tenant's item (DB-02)", async () => {
    // REGRESSION: accepted before migration 0003 — item_events.item_id
    // had no foreign key at all.
    await refuses("item_events",
      `INSERT INTO item_events (id,org_id,item_id,type,occurred_at) VALUES ('x',$1,$2,'saved',1)`,
      [b.orgId, itemA])
  })

  it("keeps an activity event when its item is deleted, without orphaning it", async () => {
    await testPool().query(
      `INSERT INTO item_events (id,org_id,item_id,type,occurred_at) VALUES ('ev_keep',$1,$2,'saved',1)`,
      [a.orgId, itemA])
    await testPool().query("DELETE FROM saved_items WHERE id = $1", [itemA])
    const { rows } = await testPool().query("SELECT item_id, org_id FROM item_events WHERE id = 'ev_keep'")
    expect(rows).toHaveLength(1)          // the record survives
    expect(rows[0].item_id).toBeNull()    // …with no dangling reference
    expect(rows[0].org_id).toBe(a.orgId)  // …still correctly scoped
  })

  it("cascades a tenant's entire footprint when the organization is deleted", async () => {
    await testPool().query("DELETE FROM organizations WHERE id = $1", [a.orgId])
    for (const table of TENANT_TABLES) {
      const { rows } = await testPool().query(`SELECT count(*)::int AS n FROM ${table} WHERE org_id = $1`, [a.orgId])
      expect(rows[0].n, `${table} still holds rows for a deleted organization`).toBe(0)
    }
    // …and the other tenant is untouched
    const { rows } = await testPool().query("SELECT count(*)::int AS n FROM saved_items WHERE org_id = $1", [b.orgId])
    expect(rows[0].n).toBeGreaterThan(0)
  })
})

describeDb("known limitation: reads are enforced in the repository, not by RLS", () => {
  beforeAll(async () => { await migrate() })
  afterAll(async () => { await closePool() })

  it("records that row-level security is not enabled on the tenant tables", async () => {
    /* This test documents the CURRENT, HONEST state rather than
     * asserting a property we have. See finding DB-03 in
     * docs/POCKET2_PHASE2_SECURITY.md.
     *
     * Composite foreign keys make cross-tenant WRITES impossible at
     * the storage layer (proved above). Cross-tenant READS are
     * prevented by every repository function taking orgId and
     * filtering on it — an application-layer guarantee. Enabling RLS
     * would move that guarantee into the database too, but requires
     * every Pocket2 query to run inside a transaction that sets a
     * tenant session variable, which is a change to the whole
     * data-access layer and is deliberately not being made inside a
     * security checkpoint.
     *
     * When RLS is implemented, this test should be inverted. */
    const { rows } = await testPool().query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname = ANY($1::text[])`,
      [TENANT_TABLES],
    )
    const withRls = rows.filter((r) => r.relrowsecurity).map((r) => r.relname)
    expect(withRls, "RLS appears to be enabled — invert this test and close DB-03").toEqual([])
  })
})

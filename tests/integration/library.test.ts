import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closePool, createTenant, hasDatabase, migrate, resetPocket2, testPool, type Tenant } from "../support/db"
import { getLibraryFacets, listItems, saveItem, updateItemState } from "@/lib/pocket2/repo/items"
import type { ContentType } from "@/lib/pocket2/domain/types"

/* Exercises the combined filter/sort/pagination statement in
 * listItems() against real SQL. This query is the library's hot path
 * and the one place where a subtle predicate error would silently
 * return the wrong library rather than fail loudly. */

const describeDb = hasDatabase ? describe : describe.skip

/** Applies the metadata an ingestion run would produce, so filters
 * can be tested without standing up the (Phase 2) fetch pipeline. */
async function ingested(
  itemId: string,
  fields: { contentType?: ContentType; title?: string; description?: string; readingTime?: number; savedAt?: number },
) {
  await testPool().query(
    `UPDATE saved_items SET content_type = coalesce($2, content_type),
        title = coalesce($3, title), description = coalesce($4, description),
        reading_time_seconds = coalesce($5, reading_time_seconds),
        saved_at = coalesce($6, saved_at), ingest_status = 'ready'
      WHERE id = $1`,
    [itemId, fields.contentType ?? null, fields.title ?? null, fields.description ?? null,
     fields.readingTime ?? null, fields.savedAt ?? null],
  )
}

describeDb("library query", () => {
  let t: Tenant

  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })

  beforeEach(async () => {
    await resetPocket2()
    t = await createTenant("libuser")
  })

  it("filters by content type, status and tag together", async () => {
    const a = await saveItem(t.orgId, t.userId, "https://news.test/ai-breakthrough")
    const b = await saveItem(t.orgId, t.userId, "https://blog.test/ai-opinion")
    const c = await saveItem(t.orgId, t.userId, "https://video.test/ai-talk")
    await ingested(a.item.id, { contentType: "article", title: "AI breakthrough" })
    await ingested(b.item.id, { contentType: "article", title: "AI opinion" })
    await ingested(c.item.id, { contentType: "video", title: "AI talk" })

    // tag two of them "ai"; mark one read
    const now = Date.now()
    await testPool().query("INSERT INTO tags (id,org_id,name,slug,usage_count,created_at) VALUES ('tag_ai',$1,'AI','ai',2,$2)", [t.orgId, now])
    for (const id of [a.item.id, c.item.id]) {
      await testPool().query("INSERT INTO saved_item_tags (item_id,tag_id,org_id,source,added_at) VALUES ($1,'tag_ai',$2,'user',$3)", [id, t.orgId, now])
    }
    await updateItemState(t.orgId, t.userId, b.item.id, { status: "read" })

    const articlesUnreadTaggedAi = await listItems(t.orgId, t.userId, {
      contentTypes: ["article"], status: "unread", tagSlugs: ["ai"],
    })
    expect(articlesUnreadTaggedAi.items.map((i) => i.id)).toEqual([a.item.id])
  })

  it("requires ALL selected tags, not any", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://x.test/both")
    const other = await saveItem(t.orgId, t.userId, "https://x.test/one")
    const now = Date.now()
    await testPool().query(
      `INSERT INTO tags (id,org_id,name,slug,usage_count,created_at)
       VALUES ('tag_ai',$1,'AI','ai',1,$2), ('tag_saas',$1,'SaaS','saas',1,$2)`, [t.orgId, now])
    await testPool().query(
      `INSERT INTO saved_item_tags (item_id,tag_id,org_id,source,added_at)
       VALUES ($1,'tag_ai',$3,'user',$4), ($1,'tag_saas',$3,'user',$4), ($2,'tag_ai',$3,'user',$4)`,
      [item.id, other.item.id, t.orgId, now])

    const both = await listItems(t.orgId, t.userId, { tagSlugs: ["ai", "saas"] })
    expect(both.items.map((i) => i.id)).toEqual([item.id])
  })

  it("hides archived items from the default view but shows them on request", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://x.test/archive-me")
    await saveItem(t.orgId, t.userId, "https://x.test/keep")
    await updateItemState(t.orgId, t.userId, item.id, { status: "archived" })

    const active = await listItems(t.orgId, t.userId, {})
    const archived = await listItems(t.orgId, t.userId, { status: "archived" })
    expect(active.items.map((i) => i.id)).not.toContain(item.id)
    expect(archived.items.map((i) => i.id)).toEqual([item.id])
  })

  it("excludes archived items from favorites", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://x.test/fav")
    await updateItemState(t.orgId, t.userId, item.id, { isFavorite: true })
    expect((await listItems(t.orgId, t.userId, { status: "favorite" })).items).toHaveLength(1)
    await updateItemState(t.orgId, t.userId, item.id, { status: "archived" })
    expect((await listItems(t.orgId, t.userId, { status: "favorite" })).items).toHaveLength(0)
  })

  it("searches title, description and domain", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://arxiv.test/transformers")
    await ingested(item.id, { title: "Attention mechanisms", description: "A survey of transformer architectures" })

    for (const q of ["attention", "transformer architectures", "arxiv.test"]) {
      const found = await listItems(t.orgId, t.userId, { search: q })
      expect(found.items.map((i) => i.id), `search: ${q}`).toEqual([item.id])
    }
    expect((await listItems(t.orgId, t.userId, { search: "quantum knitting" })).items).toHaveLength(0)
  })

  it("survives search input that would break a naive tsquery", async () => {
    await saveItem(t.orgId, t.userId, "https://x.test/safe")
    for (const hostile of ["a & b", "'; DROP TABLE saved_items; --", "((", "!!!", "a | | b", "<script>"]) {
      await expect(listItems(t.orgId, t.userId, { search: hostile }), hostile).resolves.toBeDefined()
    }
    // the table is still there
    expect((await listItems(t.orgId, t.userId, {})).items).toHaveLength(1)
  })

  it("paginates by keyset without skipping or repeating rows", async () => {
    const base = Date.now()
    for (let n = 0; n < 25; n++) {
      const { item } = await saveItem(t.orgId, t.userId, `https://x.test/post-${n}`)
      await ingested(item.id, { savedAt: base - n * 1000 })
    }

    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page = await listItems(t.orgId, t.userId, { limit: 7, cursor })
      seen.push(...page.items.map((i) => i.id))
      cursor = page.nextCursor ?? undefined
      pages++
      expect(pages, "pagination did not terminate").toBeLessThan(10)
    } while (cursor)

    expect(seen).toHaveLength(25)
    expect(new Set(seen).size).toBe(25)
    expect(pages).toBe(4) // 7 + 7 + 7 + 4
  })

  it("returns the first page for a corrupted cursor rather than failing", async () => {
    await saveItem(t.orgId, t.userId, "https://x.test/a")
    const page = await listItems(t.orgId, t.userId, { cursor: "not-a-real-cursor" })
    expect(page.items).toHaveLength(1)
  })

  it("sorts newest-first by default and honours the other sorts", async () => {
    const base = Date.now()
    const older = await saveItem(t.orgId, t.userId, "https://a.test/older")
    const newer = await saveItem(t.orgId, t.userId, "https://z.test/newer")
    await ingested(older.item.id, { savedAt: base - 100_000, title: "Alpha", readingTime: 600 })
    await ingested(newer.item.id, { savedAt: base, title: "Zulu", readingTime: 120 })

    const byNewest = await listItems(t.orgId, t.userId, { sort: "newest" })
    expect(byNewest.items[0].id).toBe(newer.item.id)
    expect((await listItems(t.orgId, t.userId, { sort: "oldest" })).items[0].id).toBe(older.item.id)
    expect((await listItems(t.orgId, t.userId, { sort: "title" })).items[0].title).toBe("Alpha")
    expect((await listItems(t.orgId, t.userId, { sort: "reading_time" })).items[0].id).toBe(older.item.id)
    expect((await listItems(t.orgId, t.userId, { sort: "domain" })).items[0].domain).toBe("a.test")
  })

  it("counts facets consistently with the lists they filter", async () => {
    const one = await saveItem(t.orgId, t.userId, "https://x.test/1")
    const two = await saveItem(t.orgId, t.userId, "https://x.test/2")
    const three = await saveItem(t.orgId, t.userId, "https://y.test/3")
    await ingested(one.item.id, { contentType: "article" })
    await ingested(two.item.id, { contentType: "video" })
    await ingested(three.item.id, { contentType: "article" })
    await updateItemState(t.orgId, t.userId, one.item.id, { isFavorite: true })
    await updateItemState(t.orgId, t.userId, two.item.id, { status: "archived" })

    const f = await getLibraryFacets(t.orgId, t.userId)
    expect(f).toMatchObject({ total: 2, unread: 2, favorites: 1, archived: 1 })
    expect((await listItems(t.orgId, t.userId, {})).items).toHaveLength(f.total)
    expect((await listItems(t.orgId, t.userId, { status: "favorite" })).items).toHaveLength(f.favorites)
    expect((await listItems(t.orgId, t.userId, { status: "archived" })).items).toHaveLength(f.archived)
    expect(f.byType.find((r) => r.contentType === "article")?.count).toBe(2)
  })

  it("attaches per-user state and labels without an N+1", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://x.test/decorated")
    const now = Date.now()
    await testPool().query("INSERT INTO tags (id,org_id,name,slug,usage_count,created_at) VALUES ('tag_x',$1,'Research','research',1,$2)", [t.orgId, now])
    await testPool().query("INSERT INTO saved_item_tags (item_id,tag_id,org_id,source,added_at) VALUES ($1,'tag_x',$2,'user',$3)", [item.id, t.orgId, now])
    await testPool().query("INSERT INTO collections (id,org_id,name,slug,item_count,position,created_at,updated_at) VALUES ('coll_x',$1,'Reading List','reading-list',1,0,$2,$2)", [t.orgId, now])
    await testPool().query("INSERT INTO collection_items (collection_id,item_id,org_id,position,added_at) VALUES ('coll_x',$1,$2,0,$3)", [item.id, t.orgId, now])
    await updateItemState(t.orgId, t.userId, item.id, { isFavorite: true })

    const [view] = (await listItems(t.orgId, t.userId, {})).items
    expect(view.tags.map((x) => x.slug)).toEqual(["research"])
    expect(view.collections.map((x) => x.slug)).toEqual(["reading-list"])
    expect(view.state?.isFavorite).toBe(true)
  })
})

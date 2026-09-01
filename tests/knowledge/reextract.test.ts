/* Re-extraction. The whole point of the archive is that this path
 * exists, so the properties worth pinning down are the ones that make
 * it safe to run unattended across a whole library: it must not touch
 * the network, and it must never leave the library worse than it
 * found it. */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db.ts"
import { archiveDocument, sha256 } from "@/lib/knowledge/archive/index"
import { createFilesystemStore } from "@/lib/knowledge/storage/index"
import type { BlobStore } from "@/lib/knowledge/storage/types"
import { isWorthReplacing, reextractObject } from "@/lib/knowledge/ingestion/reextract"
import { persistExtraction } from "@/lib/knowledge/ingestion/persist"
import type { ExtractionResult } from "@/lib/knowledge/ingestion/extraction/types"
import type { AccessScope } from "@/lib/knowledge/access/types"

let root = ""
let store: BlobStore

before(async () => {
  await prepareDatabase()
  root = await mkdtemp(join(tmpdir(), "wh-reextract-test-"))
  store = createFilesystemStore(root)
})

after(async () => {
  await rm(root, { recursive: true, force: true })
  await closeTestPool()
})

const scopeFor = (t: TestTenant): AccessScope => ({ userId: t.userId, workspaceId: t.orgId })

const ARTICLE = `<!doctype html><html lang="en"><head>
<title>Re-extractable | Example Engineering</title>
<meta property="og:site_name" content="Example Engineering">
<meta name="author" content="Sarah Chen"></head>
<body><nav><a href="/jobs">Jobs</a></nav>
<article>
<p>Most retrieval failures are chunking failures rather than model failures, and the distinction matters because the two have completely different fixes that teams confuse.</p>
<p>The second pattern is an embedding model mismatched to the domain, invisible in evaluation and obvious in production once real queries arrive from real users.</p>
<p>The third pattern is a ranking stage that was tuned on a corpus nobody has looked at since, which quietly rewards documents for being long rather than for being right.</p>
</article>
<footer><p>Copyright Example</p></footer></body></html>`

async function seedObject(t: TestTenant): Promise<string> {
  const p = getTestPool()
  const id = `obj_${randomUUID()}`
  const url = `https://example.com/${randomUUID()}`
  const now = Date.now()
  await p.query(
    `INSERT INTO knowledge_objects (id, org_id, created_by, submitted_url, canonical_url, url_hash,
       domain, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4, $5, 'example.com', 'completed', $6, $6)`,
    [id, t.orgId, t.userId, url, sha256(Buffer.from(url)), now],
  )
  return id
}

async function archive(t: TestTenant, objectId: string, html = ARTICLE) {
  return archiveDocument(
    scopeFor(t),
    {
      objectId,
      body: Buffer.from(html, "utf8"),
      contentType: "text/html",
      charset: "utf-8",
      requestedUrl: "https://example.com/a",
      resolvedUrl: "https://example.com/a",
      httpStatus: 200,
    },
    { store },
  )
}

async function contentRow(objectId: string) {
  const { rows } = await getTestPool().query(
    `SELECT content_text, extraction_method, extractor_version, extraction_confidence,
            site_config_matched, revision, artifact_id
     FROM knowledge_content WHERE object_id = $1`,
    [objectId],
  )
  return rows[0] as
    | {
        content_text: string | null
        extraction_method: string | null
        extractor_version: string | null
        extraction_confidence: number | null
        site_config_matched: boolean
        revision: number
        artifact_id: string | null
      }
    | undefined
}

describe("re-extraction", () => {
  it("rebuilds content from the archive with no fetch at all", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    const artifact = await archive(t, objectId)

    const outcome = await reextractObject(scope, objectId, { store })
    assert.equal(outcome.status, "replaced")
    assert.equal(outcome.method, "readability")

    const row = await contentRow(objectId)
    assert.ok(row)
    assert.match(row.content_text ?? "", /chunking failures/)
    assert.doesNotMatch(row.content_text ?? "", /Jobs|Copyright Example/)
    assert.equal(row.artifact_id, artifact.id, "content must record which bytes produced it")
    assert.equal(row.extraction_method, "readability")
    assert.equal(row.extractor_version, "readability@1")
    assert.ok((row.extraction_confidence ?? 0) > 0)
  })

  it("records extraction provenance the reader can act on", async () => {
    const t = await createTenant("re")
    const objectId = await seedObject(t)
    await archive(t, objectId)

    await reextractObject(scopeFor(t), objectId, { store })
    const row = await contentRow(objectId)
    assert.equal(row?.site_config_matched, false)
    assert.equal(row?.revision, 1, "the first write is revision 1")
  })

  it("bumps the revision so a change is distinguishable from a re-read", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await archive(t, objectId)

    await reextractObject(scope, objectId, { store })
    assert.equal((await contentRow(objectId))?.revision, 1)

    // force, because an identical re-run is deliberately a no-op.
    await reextractObject(scope, objectId, { store, force: true })
    assert.equal((await contentRow(objectId))?.revision, 2)
  })

  it("does nothing when the same ruleset produces the same article", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await archive(t, objectId)

    await reextractObject(scope, objectId, { store })
    const outcome = await reextractObject(scope, objectId, { store })
    assert.equal(outcome.status, "unchanged")
    assert.equal((await contentRow(objectId))?.revision, 1, "a no-op must not burn a revision")
  })

  it("leaves the last known good article alone when the new run is worse", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await archive(t, objectId)
    await reextractObject(scope, objectId, { store })
    const before = await contentRow(objectId)

    // Pinning tier 3 produces metadata only — a strictly worse result
    // than the body already stored.
    const outcome = await reextractObject(scope, objectId, { store, only: "metadata" })
    assert.equal(outcome.status, "declined")
    assert.match(outcome.reason ?? "", /no body/)

    const after = await contentRow(objectId)
    assert.equal(after?.content_text, before?.content_text, "the stored article must be untouched")
    assert.equal(after?.revision, before?.revision)
  })

  it("overrides the guard only when explicitly forced", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await archive(t, objectId)
    await reextractObject(scope, objectId, { store })

    const outcome = await reextractObject(scope, objectId, { store, only: "metadata", force: true })
    assert.equal(outcome.status, "replaced")
    assert.equal((await contentRow(objectId))?.extraction_method, "metadata")
  })

  it("leaves stored content intact when the archive is gone", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    const artifact = await archive(t, objectId)
    await reextractObject(scope, objectId, { store })
    const before = await contentRow(objectId)

    await store.delete(artifact.storageKey)
    const outcome = await reextractObject(scope, objectId, { store })
    assert.equal(outcome.status, "failed")
    assert.equal(outcome.failureCode, "artifact_missing")

    const after = await contentRow(objectId)
    assert.equal(after?.content_text, before?.content_text, "a failed re-run must never destroy the good copy")
  })

  it("fails cleanly when nothing was ever archived", async () => {
    const t = await createTenant("re")
    const objectId = await seedObject(t)
    const outcome = await reextractObject(scopeFor(t), objectId, { store })
    assert.equal(outcome.status, "failed")
    assert.equal(outcome.failureCode, "artifact_missing")
  })

  it("cannot re-extract another workspace's object", async () => {
    const owner = await createTenant("owner")
    const other = await createTenant("other")
    const objectId = await seedObject(owner)
    await archive(owner, objectId)
    await reextractObject(scopeFor(owner), objectId, { store })
    const before = await contentRow(objectId)

    const outcome = await reextractObject(scopeFor(other), objectId, { store })
    assert.equal(outcome.status, "failed")
    assert.equal(outcome.failureCode, "artifact_missing")
    assert.equal((await contentRow(objectId))?.content_text, before?.content_text)
  })

  it("re-runs a specific older capture when asked", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const v1 = await archive(t, objectId, ARTICLE.replace("Re-extractable", "Version One"))
    await archive(t, objectId, ARTICLE.replace("Re-extractable", "Version Two"))

    await reextractObject(scope, objectId, { store, artifactId: v1.id, force: true })
    const { rows } = await getTestPool().query(`SELECT title FROM knowledge_objects WHERE id = $1`, [objectId])
    assert.equal(rows[0].title, "Version One")
  })

  it("does not overwrite fetch provenance it did not gather", async () => {
    const t = await createTenant("re")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await archive(t, objectId)

    // A first ingestion recorded where the bytes came from.
    const extracted = {
      title: "Ingested",
      contentHtml: "<p>body</p>",
      contentText: "body",
      excerpt: null,
      authors: [],
      publishedAt: null,
      language: null,
      siteName: null,
      canonicalUrl: null,
      imageUrl: null,
      faviconUrl: null,
      images: [],
      method: "readability",
      extractorVersion: "readability@1",
      siteConfigMatched: false,
      confidence: 0.4,
    } satisfies ExtractionResult
    await persistExtraction(scope, {
      objectId,
      extracted,
      artifactId: null,
      fetch: { resolvedUrl: "https://example.com/final", originUrl: "https://example.com/short", httpStatus: 200 },
    })

    await reextractObject(scope, objectId, { store, force: true })

    const { rows } = await getTestPool().query(
      `SELECT resolved_url, origin_url, http_status FROM knowledge_objects WHERE id = $1`,
      [objectId],
    )
    assert.equal(rows[0].resolved_url, "https://example.com/final", "re-extraction performed no fetch")
    assert.equal(rows[0].origin_url, "https://example.com/short")
    assert.equal(rows[0].http_status, 200)
  })
})

describe("isWorthReplacing", () => {
  const result = (over: Partial<ExtractionResult> = {}): ExtractionResult => ({
    title: "t",
    contentHtml: "<p>x</p>",
    contentText: "x".repeat(1000),
    excerpt: null,
    authors: [],
    publishedAt: null,
    language: null,
    siteName: null,
    canonicalUrl: null,
    imageUrl: null,
    faviconUrl: null,
    images: [],
    method: "readability",
    extractorVersion: "readability@1",
    siteConfigMatched: false,
    confidence: 0.5,
    ...over,
  })

  it("accepts anything when there is nothing stored to lose", () => {
    assert.equal(isWorthReplacing(result(), null).ok, true)
    assert.equal(isWorthReplacing(result(), { textLength: 0, siteConfigMatched: false }).ok, true)
  })

  it("lets a site-specific rule beat a generic heuristic", () => {
    const verdict = isWorthReplacing(result({ siteConfigMatched: true, contentText: "x".repeat(400) }), {
      textLength: 1000,
      siteConfigMatched: false,
    })
    assert.equal(verdict.ok, true, "a human wrote a rule for this domain; trust it")
  })

  it("refuses a run that lost most of the article", () => {
    const verdict = isWorthReplacing(result({ contentText: "x".repeat(500) }), {
      textLength: 1000,
      siteConfigMatched: false,
    })
    assert.equal(verdict.ok, false)
    assert.match(verdict.reason, /50% of the stored one/)
  })

  it("accepts a run that holds or grows", () => {
    assert.equal(isWorthReplacing(result(), { textLength: 1000, siteConfigMatched: false }).ok, true)
    assert.equal(
      isWorthReplacing(result({ contentText: "x".repeat(5000) }), { textLength: 1000, siteConfigMatched: false }).ok,
      true,
    )
  })

  it("refuses a run that produced nothing at all", () => {
    const empty = result({ contentText: "", contentHtml: null, title: null })
    assert.equal(isWorthReplacing(empty, null).ok, false)
    assert.equal(isWorthReplacing(empty, { textLength: 1000, siteConfigMatched: false }).ok, false)
  })
})

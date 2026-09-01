/* The queue's M2 additions: a second job kind, and the dispatch that
 * routes it. The ingest path is covered in ingestion.test.ts, which can
 * inject a fetcher; here the point is that re-extraction is a real,
 * claimable, idempotent unit of work that a worker picks up without
 * touching the network. */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db.ts"
import { archiveDocument, collectReleasedArtifacts, listArtifacts, releaseSupersededArtifacts, sha256 } from "@/lib/knowledge/archive/index"
import { createFilesystemStore } from "@/lib/knowledge/storage/index"
import type { BlobStore } from "@/lib/knowledge/storage/types"
import { claimNextJob, enqueueJob, newRunnerId } from "@/lib/knowledge/ingestion/jobs"
import { reextractObject } from "@/lib/knowledge/ingestion/reextract"
import type { AccessScope } from "@/lib/knowledge/access/types"

let root = ""
let store: BlobStore

before(async () => {
  await prepareDatabase()
  root = await mkdtemp(join(tmpdir(), "wh-jobs-test-"))
  store = createFilesystemStore(root)
})

after(async () => {
  await rm(root, { recursive: true, force: true })
  await closeTestPool()
})

const scopeFor = (t: TestTenant): AccessScope => ({ userId: t.userId, workspaceId: t.orgId })

const ARTICLE = `<!doctype html><html lang="en"><head><title>Queued</title></head><body><article>
<p>Most retrieval failures are chunking failures rather than model failures, and the distinction matters because the two have completely different fixes.</p>
<p>The second pattern is an embedding model mismatched to the domain, invisible in evaluation and obvious in production once real queries arrive.</p>
<p>The third is a ranking stage tuned on a corpus nobody has looked at since, quietly rewarding documents for being long rather than for being right.</p>
</article></body></html>`

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

/** The queue is global, and this file's tenants share it. A test that
 * claims must start from a known-empty queue or it picks up another
 * test's leftovers. */
async function clearQueue(): Promise<void> {
  await getTestPool().query("DELETE FROM knowledge_jobs")
}

const archive = (t: TestTenant, objectId: string, html = ARTICLE) =>
  archiveDocument(
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

describe("job kinds", () => {
  it("enqueues a re-extraction as its own claimable job", async () => {
    await clearQueue()
    const t = await createTenant("jobs")
    const objectId = await seedObject(t)

    const queued = await enqueueJob(scopeFor(t), objectId, "reextract")
    assert.ok(queued)
    assert.equal(queued.created, true)

    const claimed = await claimNextJob(newRunnerId())
    assert.ok(claimed)
    assert.equal(claimed.kind, "reextract", "the claim must carry the kind, or the runner cannot dispatch")
    assert.equal(claimed.objectId, objectId)
  })

  it("keeps one live re-extraction per item however often it is asked for", async () => {
    const t = await createTenant("jobs")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const first = await enqueueJob(scope, objectId, "reextract")
    const second = await enqueueJob(scope, objectId, "reextract")
    assert.equal(first?.created, true)
    assert.equal(second?.created, false, "a second request re-arms; it does not duplicate work")
    assert.equal(first?.jobId, second?.jobId)

    const { rows } = await getTestPool().query(
      "SELECT id FROM knowledge_jobs WHERE object_id = $1 AND kind = 'reextract'",
      [objectId],
    )
    assert.equal(rows.length, 1)
  })

  it("gives a re-armed job a fresh allowance of attempts", async () => {
    const t = await createTenant("jobs")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await enqueueJob(scope, objectId, "reextract")

    await getTestPool().query(
      "UPDATE knowledge_jobs SET status = 'failed', attempt = 3, last_error_code = 'old' WHERE object_id = $1",
      [objectId],
    )
    await enqueueJob(scope, objectId, "reextract")

    const { rows } = await getTestPool().query(
      "SELECT status, attempt, last_error_code FROM knowledge_jobs WHERE object_id = $1",
      [objectId],
    )
    assert.equal(rows[0].status, "pending")
    assert.equal(rows[0].attempt, 0, "asked for today, so it gets today's attempts — not last month's leftovers")
    assert.equal(rows[0].last_error_code, null)
  })

  it("does not re-arm a job a runner is holding right now", async () => {
    await clearQueue()
    const t = await createTenant("jobs")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await enqueueJob(scope, objectId, "reextract")
    await claimNextJob(newRunnerId())

    assert.equal(await enqueueJob(scope, objectId, "reextract"), null, "stealing an active job would run it twice")
  })

  it("refuses to enqueue against another workspace's object", async () => {
    const owner = await createTenant("owner")
    const other = await createTenant("other")
    const objectId = await seedObject(owner)

    assert.equal(await enqueueJob(scopeFor(other), objectId, "reextract"), null)
    const { rows } = await getTestPool().query("SELECT id FROM knowledge_jobs WHERE object_id = $1", [objectId])
    assert.equal(rows.length, 0)
  })

  it("runs a claimed re-extraction with no network at all", async () => {
    await clearQueue()
    const t = await createTenant("jobs")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await archive(t, objectId)
    await enqueueJob(scope, objectId, "reextract")

    const claimed = await claimNextJob(newRunnerId())
    assert.ok(claimed)
    const outcome = await reextractObject(scope, claimed.objectId, { store })
    assert.equal(outcome.status, "replaced")

    const { rows } = await getTestPool().query(
      "SELECT content_text FROM knowledge_content WHERE object_id = $1",
      [objectId],
    )
    assert.match(rows[0].content_text, /chunking failures/)
  })
})

describe("artifact collection sweep", () => {
  it("collects released blobs and forgets their rows", async () => {
    const t = await createTenant("gc")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const old = await archive(t, objectId, `${ARTICLE}<p>v1</p>`)
    await archive(t, objectId, `${ARTICLE}<p>v2</p>`)
    await releaseSupersededArtifacts(scope, objectId, 1)

    const result = await collectReleasedArtifacts(50, { store })
    assert.ok(result.collected >= 1)
    assert.equal(result.failed, 0)

    assert.equal(await store.get(old.storageKey), null, "the blob must actually be gone")
    const { rows } = await getTestPool().query("SELECT id FROM knowledge_artifacts WHERE id = $1", [old.id])
    assert.equal(rows.length, 0, "and its row with it")
  })

  it("never touches an artifact retention has not released", async () => {
    const t = await createTenant("gc")
    const objectId = await seedObject(t)
    const live = await archive(t, objectId)

    await collectReleasedArtifacts(50, { store })

    assert.ok(await store.get(live.storageKey), "the live capture must survive a sweep")
    assert.deepEqual(
      (await listArtifacts(scopeFor(t), objectId)).map((a) => a.id),
      [live.id],
    )
  })

  it("keeps the row when the blob delete fails, so it is retried not leaked", async () => {
    const t = await createTenant("gc")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    await archive(t, objectId, `${ARTICLE}<p>a</p>`)
    await archive(t, objectId, `${ARTICLE}<p>b</p>`)
    await releaseSupersededArtifacts(scope, objectId, 1)

    const brokenStore: BlobStore = {
      ...store,
      async delete() {
        throw new Error("storage is having a bad day")
      },
    }
    const result = await collectReleasedArtifacts(50, { store: brokenStore })
    assert.equal(result.collected, 0)
    assert.ok(result.failed >= 1)

    // Still marked, still collectable: the next sweep tries again.
    const { rows } = await getTestPool().query(
      "SELECT id FROM knowledge_artifacts WHERE object_id = $1 AND deleted_at IS NOT NULL",
      [objectId],
    )
    assert.equal(rows.length, 1)
  })
})

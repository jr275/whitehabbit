/* The archive. M2's single hard requirement is that the original
 * fetched representation is never lost, so these tests are less about
 * "does it store bytes" and more about every way the bytes could be
 * lost, corrupted, leaked to another tenant, or silently replaced by
 * something that only looks like them. */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { gzipSync } from "node:zlib"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db.ts"
import {
  archiveDocument,
  ArchiveError,
  claimCollectableArtifacts,
  forgetArtifact,
  latestArtifact,
  listArtifacts,
  loadArtifact,
  loadLatestArtifact,
  releaseSupersededArtifacts,
  sha256,
} from "@/lib/knowledge/archive/index"
import { createFilesystemStore } from "@/lib/knowledge/storage/index"
import type { BlobStore } from "@/lib/knowledge/storage/types"
import type { AccessScope } from "@/lib/knowledge/access/types"

let root = ""
let store: BlobStore

before(async () => {
  await prepareDatabase()
  root = await mkdtemp(join(tmpdir(), "wh-archive-test-"))
  store = createFilesystemStore(root)
})

after(async () => {
  await rm(root, { recursive: true, force: true })
  await closeTestPool()
})

function scopeFor(t: TestTenant): AccessScope {
  return { userId: t.userId, workspaceId: t.orgId }
}

/** A saved object for artifacts to hang off. */
async function seedObject(t: TestTenant, url = `https://example.com/${randomUUID()}`): Promise<string> {
  const p = getTestPool()
  const id = `obj_${randomUUID()}`
  const now = Date.now()
  await p.query(
    `INSERT INTO knowledge_objects (id, org_id, created_by, submitted_url, canonical_url, url_hash,
       domain, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4, $5, 'example.com', 'pending', $6, $6)`,
    [id, t.orgId, t.userId, url, sha256(Buffer.from(url)), now],
  )
  return id
}

/** Big enough that the archive compresses it, and compressible. */
const DOCUMENT = Buffer.from(
  `<!doctype html><html><head><title>Archived</title></head><body>${"<p>real article prose here.</p>".repeat(200)}</body></html>`,
  "utf8",
)

function request(objectId: string, body = DOCUMENT) {
  return {
    objectId,
    body,
    contentType: "text/html",
    charset: "utf-8",
    requestedUrl: "https://example.com/a",
    resolvedUrl: "https://example.com/a",
    httpStatus: 200,
  }
}

describe("document archive", () => {
  it("stores the bytes and returns them byte-identical", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const artifact = await archiveDocument(scope, request(objectId), { store })
    assert.equal(artifact.objectId, objectId)
    assert.equal(artifact.workspaceId, t.orgId)
    assert.equal(artifact.contentEncoding, "gzip")
    assert.equal(artifact.originalByteSize, DOCUMENT.byteLength)
    assert.ok(artifact.byteSize < artifact.originalByteSize, "an HTML document must compress")
    assert.equal(artifact.checksum, sha256(DOCUMENT))

    const loaded = await loadArtifact(scope, artifact.id, { store })
    assert.equal(Buffer.compare(loaded.body, DOCUMENT), 0, "the original representation must survive exactly")
    assert.match(loaded.html, /<title>Archived<\/title>/)
  })

  it("stores a tiny document uncompressed rather than making it bigger", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    const tiny = Buffer.from("<html>hi</html>")

    const artifact = await archiveDocument(scope, request(objectId, tiny), { store })
    assert.equal(artifact.contentEncoding, "identity")
    const loaded = await loadArtifact(scope, artifact.id, { store })
    assert.equal(Buffer.compare(loaded.body, tiny), 0)
  })

  it("preserves bytes a decode would mangle", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    // Invalid UTF-8. Decoding to a string and back would replace these
    // with U+FFFD; archiving the raw bytes must not.
    const body = Buffer.concat([Buffer.from("<html>"), Buffer.from([0xff, 0xfe, 0x80]), Buffer.from("</html>")])

    const artifact = await archiveDocument(scope, request(objectId, body), { store })
    const loaded = await loadArtifact(scope, artifact.id, { store })
    assert.equal(Buffer.compare(loaded.body, body), 0, "we archive bytes, not a decoded string")
  })

  it("decodes with the charset the publisher declared", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    const body = Buffer.from("<html><p>caf\xe9</p></html>", "latin1")

    const artifact = await archiveDocument(
      scope,
      { ...request(objectId, body), charset: "iso-8859-1" },
      { store },
    )
    const loaded = await loadArtifact(scope, artifact.id, { store })
    assert.match(loaded.html, /café/, "a latin-1 page must not come back as mojibake")
  })

  it("is idempotent: re-archiving identical bytes does not duplicate", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const first = await archiveDocument(scope, request(objectId), { store })
    const second = await archiveDocument(scope, request(objectId), { store })

    assert.equal(second.id, first.id, "a retried job must not create a second capture")
    assert.equal((await listArtifacts(scope, objectId)).length, 1)
    // The losing blob must be collected, not left as an orphan.
    const loaded = await loadArtifact(scope, first.id, { store })
    assert.equal(Buffer.compare(loaded.body, DOCUMENT), 0)
  })

  it("keeps every DIFFERENT capture, newest first", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const v1 = await archiveDocument(scope, { ...request(objectId), fetchedAt: 1000 }, { store })
    const v2 = await archiveDocument(
      scope,
      { ...request(objectId, Buffer.from(DOCUMENT.toString() + "<p>edited</p>")), fetchedAt: 2000 },
      { store },
    )

    const all = await listArtifacts(scope, objectId)
    assert.deepEqual(
      all.map((a) => a.id),
      [v2.id, v1.id],
    )
    assert.equal((await latestArtifact(scope, objectId))?.id, v2.id)
  })

  it("refuses to archive nothing", async () => {
    const t = await createTenant("arch")
    const objectId = await seedObject(t)
    await assert.rejects(
      () => archiveDocument(scopeFor(t), request(objectId, Buffer.alloc(0)), { store }),
      ArchiveError,
    )
  })

  it("detects corruption instead of handing back bad bytes", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    const artifact = await archiveDocument(scope, request(objectId), { store })

    // Something else in the bucket wrote over it, plausibly enough to
    // decompress but not to match its checksum.
    await store.put(artifact.storageKey, gzipSync(Buffer.from("<html>not the article</html>")), {
      contentType: "text/html",
      contentEncoding: "gzip",
      checksum: artifact.checksum,
    })

    await assert.rejects(
      () => loadArtifact(scope, artifact.id, { store }),
      (err: unknown) => {
        assert.ok(err instanceof ArchiveError)
        assert.equal(err.code, "artifact_corrupt")
        return true
      },
    )
  })

  it("refuses to inflate a decompression bomb", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    const artifact = await archiveDocument(scope, request(objectId), { store })

    // ~200 MB of zeroes in a few KB. We only ever compress our own
    // capped documents — but the cap must be enforced, not assumed.
    const bomb = gzipSync(Buffer.alloc(200 * 1024 * 1024))
    await store.put(artifact.storageKey, bomb, {
      contentType: "text/html",
      contentEncoding: "gzip",
      checksum: artifact.checksum,
    })

    await assert.rejects(
      () => loadArtifact(scope, artifact.id, { store }),
      (err: unknown) => {
        assert.ok(err instanceof ArchiveError)
        assert.equal(err.code, "artifact_too_large", `got ${(err as ArchiveError).code}`)
        return true
      },
    )
  })

  it("says so loudly when the row outlived its bytes", async () => {
    const t = await createTenant("arch")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)
    const artifact = await archiveDocument(scope, request(objectId), { store })

    await store.delete(artifact.storageKey)
    await assert.rejects(
      () => loadArtifact(scope, artifact.id, { store }),
      (err: unknown) => {
        assert.ok(err instanceof ArchiveError)
        assert.equal(err.code, "artifact_missing")
        return true
      },
    )
  })

  it("reports a missing archive distinctly from a missing object", async () => {
    const t = await createTenant("arch")
    const objectId = await seedObject(t)
    await assert.rejects(() => loadLatestArtifact(scopeFor(t), objectId, { store }), ArchiveError)
  })
})

describe("artifact tenancy", () => {
  it("never returns another workspace's artifact", async () => {
    const owner = await createTenant("owner")
    const other = await createTenant("other")
    const objectId = await seedObject(owner)
    const artifact = await archiveDocument(scopeFor(owner), request(objectId), { store })

    // The artifact id is known to the attacker; the tenant is not.
    assert.equal(await latestArtifact(scopeFor(other), objectId), null)
    assert.deepEqual(await listArtifacts(scopeFor(other), objectId), [])
    await assert.rejects(
      () => loadArtifact(scopeFor(other), artifact.id, { store }),
      (err: unknown) => {
        assert.ok(err instanceof ArchiveError)
        // Raw attacker-controlled HTML: the tenant check happens before
        // the blob is even located, so this is a lookup miss.
        assert.equal(err.code, "artifact_missing")
        return true
      },
    )
  })

  it("refuses to record an artifact against another workspace's object", async () => {
    const owner = await createTenant("owner")
    const other = await createTenant("other")
    const objectId = await seedObject(owner)

    await assert.rejects(() => archiveDocument(scopeFor(other), request(objectId), { store }))
    assert.deepEqual(await listArtifacts(scopeFor(owner), objectId), [])
  })
})

describe("artifact retention", () => {
  it("never releases the newest capture", async () => {
    const t = await createTenant("ret")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const captures = []
    for (let i = 0; i < 5; i += 1) {
      captures.push(
        await archiveDocument(
          scope,
          { ...request(objectId, Buffer.from(`${DOCUMENT.toString()}<p>v${i}</p>`)), fetchedAt: 1000 + i },
          { store },
        ),
      )
    }

    const released = await releaseSupersededArtifacts(scope, objectId, 3)
    assert.equal(released, 2)

    const surviving = await listArtifacts(scope, objectId)
    assert.deepEqual(
      surviving.map((a) => a.id),
      [captures[4].id, captures[3].id, captures[2].id],
    )
    // The reprocessing input is still readable.
    const loaded = await loadLatestArtifact(scope, objectId, { store })
    assert.match(loaded.html, /<p>v4<\/p>/)
  })

  it("refuses a retention policy that would keep nothing", async () => {
    const t = await createTenant("ret")
    const objectId = await seedObject(t)
    await assert.rejects(() => releaseSupersededArtifacts(scopeFor(t), objectId, 0))
  })

  it("collects released blobs in two phases, never the live one", async () => {
    const t = await createTenant("ret")
    const scope = scopeFor(t)
    const objectId = await seedObject(t)

    const old = await archiveDocument(scope, { ...request(objectId), fetchedAt: 1 }, { store })
    const live = await archiveDocument(
      scope,
      { ...request(objectId, Buffer.from(`${DOCUMENT.toString()}<p>new</p>`)), fetchedAt: 2 },
      { store },
    )
    await releaseSupersededArtifacts(scope, objectId, 1)

    const collectable = await claimCollectableArtifacts(50)
    const ids = collectable.map((a) => a.id)
    assert.ok(ids.includes(old.id))
    assert.ok(!ids.includes(live.id), "a live artifact must never be collectable")

    // Phase one: the blob. Phase two: the row.
    for (const artifact of collectable) {
      await store.delete(artifact.storageKey)
      await forgetArtifact(artifact.id)
    }
    assert.deepEqual(
      (await listArtifacts(scope, objectId)).map((a) => a.id),
      [live.id],
    )
    assert.ok(await loadLatestArtifact(scope, objectId, { store }), "the surviving capture is still readable")
  })
})

/* ================================================================== *
 * /api/knowledge/indexing — the operations surface.
 *
 * countJobs is tested against real rows because it is a scoped
 * aggregate, and an aggregate that ignores its scope is a queue-depth
 * leak that looks like a number. The route itself is asserted by
 * source inspection: it imports next/server, which this repo's
 * plain-Node runner cannot load (see tests/knowledge/tick.test.ts's
 * header for the same constraint and the same remedy).
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { countJobs } from "@/lib/knowledge/backfill"
import * as repo from "@/lib/knowledge/repo"

async function saveItem(t: TestTenant): Promise<string> {
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,'A piece','Ex','ex.test',$5,$6,$6)`,
    [id, t.orgId, t.userId, `https://ex.test/${id}`, "Body text about retrieval.", now],
  )
  return id
}

describe("countJobs", () => {
  let alice: TestTenant
  let bob: TestTenant

  before(async () => {
    await prepareDatabase()
  })
  beforeEach(async () => {
    alice = await createTenant("jobs-a")
    bob = await createTenant("jobs-b")
  })
  after(closeTestPool)

  it("reports zero for a tenant with no jobs", async () => {
    assert.deepEqual(await countJobs({ orgId: alice.orgId, userId: alice.userId }), {
      queued: 0,
      leased: 0,
      failed: 0,
      done: 0,
    })
  })

  it("counts an unclaimed job as queued, not leased", async () => {
    const id = await saveItem(alice)
    await repo.enqueueIndexJob(id, alice.orgId, alice.userId)
    const counts = await countJobs({ orgId: alice.orgId, userId: alice.userId })
    assert.equal(counts.queued, 1)
    assert.equal(counts.leased, 0)
  })

  it("follows a job from queued through leased to done", async () => {
    // A claim is a lease on a still-`queued` row (see migration 0006).
    // Reporting a leased job as plain `queued` would show an operator a
    // queue that never drains while the work is actually in flight.
    const id = await saveItem(alice)
    const job = await repo.enqueueIndexJob(id, alice.orgId, alice.userId)
    // claimJobById, not claimJobs: the claim scan is global and would
    // otherwise pick up whatever another test left behind.
    const claimed = await repo.claimJobById(job!.id, "worker-test")
    assert.ok(claimed, "the job should have been claimable")

    const inFlight = await countJobs({ orgId: alice.orgId, userId: alice.userId })
    assert.equal(inFlight.leased, 1)
    assert.equal(inFlight.queued, 0, "a leased job must not also be reported as waiting")

    await repo.completeJob(claimed.id, "worker-test")
    const after = await countJobs({ orgId: alice.orgId, userId: alice.userId })
    assert.deepEqual(after, { queued: 0, leased: 0, failed: 0, done: 1 })
  })

  it("never counts another tenant's queue", async () => {
    // Queue depth is operational information about someone else's
    // library. It leaks less than content and it still leaks.
    const id = await saveItem(bob)
    await repo.enqueueIndexJob(id, bob.orgId, bob.userId)
    assert.equal((await countJobs({ orgId: alice.orgId, userId: alice.userId })).queued, 0)
    assert.equal((await countJobs({ orgId: bob.orgId, userId: bob.userId })).queued, 1)
  })
})

describe("app/api/knowledge/indexing/route.ts — source guard", () => {
  const source = readFileSync(join(process.cwd(), "app/api/knowledge/indexing/route.ts"), "utf8")
  const get = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"))
  const post = source.slice(source.indexOf("export async function POST"))

  it("exposes exactly GET and POST", () => {
    assert.match(source, /export async function GET/)
    assert.match(source, /export async function POST/)
    assert.doesNotMatch(source, /export async function (PUT|DELETE|PATCH)/)
  })

  it("declares the Node.js runtime — it reaches the database", () => {
    assert.match(source, /export const runtime = "nodejs"/)
  })

  it("takes scope from the session in both verbs, never from a request", () => {
    for (const [name, body] of [["GET", get], ["POST", post]] as const) {
      assert.match(body, /await requireSession\(\)/, `${name} does not establish a session`)
      assert.match(body, /orgId: organizationId, userId/, `${name} does not scope to the session`)
    }
  })

  it("GET writes nothing", () => {
    // A status endpoint that mutates is a status endpoint nobody can
    // safely poll.
    assert.doesNotMatch(get, /enqueueBackfill|recordAudit|enforceRateLimit/)
  })

  it("POST rate-limits before doing the work, not after", () => {
    assert.match(post, /enforceRateLimit\("knowledge_backfill", organizationId\)/)
    assert.ok(
      post.indexOf("enforceRateLimit") < post.indexOf("enqueueBackfill"),
      "the limit must be enforced before the survey runs",
    )
  })

  it("POST enqueues and returns — it does not run the jobs itself", () => {
    // No second worker. The existing tick drains the queue.
    assert.doesNotMatch(post, /runIndexJob|claimJob|drainJobs|embedItemChunks/)
  })

  it("reports the model but never the credential", () => {
    assert.match(source, /model: provider\.model/)
    assert.doesNotMatch(source, /GEMINI_API_KEY|ANTHROPIC_API_KEY|apiKey/)
  })
})

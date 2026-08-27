import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createOrganization, getWorker, listWorkers, upsertWorker, userBelongsToOrg, createUserWithOrganization } from "./repo"
import { buildEmptyWorker } from "@/lib/workforce/seed"

/* ================================================================== *
 * TENANT ISOLATION — a real integration test against a real Postgres
 * database (not mocked), per the brief's own instruction: "Não
 * confiar na UI. Não usar apenas filtros no frontend." Every assertion
 * here exercises the actual repo functions every API route calls.
 *
 * Requires DATABASE_URL (see README/.env.example) — skips with a clear
 * reason rather than failing the whole suite when no database is
 * configured for this run, matching this codebase's existing "fail
 * loudly only when the operation is actually attempted" posture.
 * ================================================================== */

const hasDatabase = !!process.env.DATABASE_URL
const maybeDescribe = hasDatabase ? describe : describe.skip

if (!hasDatabase) {
  // eslint-disable-next-line no-console
  console.warn("[tenant-isolation.test] Skipped — DATABASE_URL is not set. Set it to a real Postgres connection string to run this suite.")
}

maybeDescribe("tenant isolation (real Postgres)", () => {
  it("org A cannot read org B's worker by id", async () => {
    const orgA = await createOrganization(`Tenant Test A ${randomUUID()}`)
    const orgB = await createOrganization(`Tenant Test B ${randomUUID()}`)

    const worker = buildEmptyWorker(`worker_${randomUUID()}`)
    worker.identity.name = "Org A's private worker"
    await upsertWorker(worker, orgA.id)

    const fromOwnOrg = await getWorker(worker.id, orgA.id)
    expect(fromOwnOrg?.id).toBe(worker.id)

    const fromOtherOrg = await getWorker(worker.id, orgB.id)
    expect(fromOtherOrg).toBeNull()
  })

  it("listWorkers never returns another org's rows", async () => {
    const orgA = await createOrganization(`Tenant Test A ${randomUUID()}`)
    const orgB = await createOrganization(`Tenant Test B ${randomUUID()}`)

    const workerA = buildEmptyWorker(`worker_${randomUUID()}`)
    const workerB = buildEmptyWorker(`worker_${randomUUID()}`)
    await upsertWorker(workerA, orgA.id)
    await upsertWorker(workerB, orgB.id)

    const listA = await listWorkers(orgA.id)
    const listB = await listWorkers(orgB.id)

    expect(listA.map((w) => w.id)).toContain(workerA.id)
    expect(listA.map((w) => w.id)).not.toContain(workerB.id)
    expect(listB.map((w) => w.id)).toContain(workerB.id)
    expect(listB.map((w) => w.id)).not.toContain(workerA.id)
  })

  it("a user's session org membership is real — cannot be assumed for an org they never joined", async () => {
    const { user } = await createUserWithOrganization(`tenant-iso-${randomUUID()}@example.com`, "not-a-real-hash", "My Org")
    const otherOrg = await createOrganization(`Someone Else's Org ${randomUUID()}`)

    expect(await userBelongsToOrg(user.id, otherOrg.id)).toBe(false)
  })
})

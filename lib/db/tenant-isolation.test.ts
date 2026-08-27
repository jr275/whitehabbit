import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createOrganization, getOpportunity, getWorker, insertDecision, insertOpportunity, listDecisions, listOpportunities, listWorkers, upsertWorker, userBelongsToOrg, createUserWithOrganization } from "./repo"
import type { Decision, Opportunity } from "@/lib/finance/types"
import { buildEmptyWorker } from "@/lib/workforce/seed"

function testOpportunity(workerId: string): Opportunity {
  return {
    id: `opp_${randomUUID()}`,
    category: "idle_cash",
    title: "Test opportunity",
    description: "Test",
    estimatedValue: 1000,
    currency: "USD",
    probability: 0.5,
    expectedValue: 500,
    urgency: "low",
    effort: "low",
    risk: "low",
    reversibility: "reversible",
    confidence: 80,
    evidence: [],
    assumptions: [],
    recommendedAction: "Test",
    economics: { grossImpact: 1000, probability: 0.5, expectedValue: 500, riskAdjustment: 0, effortAdjustment: 0, priorityValue: 500 },
    status: "READY",
    createdAt: Date.now(),
    workerId,
  }
}

function testDecision(workerId: string, opportunityId: string): Decision {
  return {
    id: `dec_${randomUUID()}`,
    title: "Test decision",
    problem: "Test",
    evidence: [],
    assumptions: [],
    alternatives: [],
    scenario: { label: "s", baseline: {}, scenario: {}, receivablesRelease: 0, payablesRelease: 0, cashImpact: 0, liquidityImpact: 0, economicImpact: 0, kind: "SIMULATION" },
    economicImpact: { cashRelease: 0, annualBenefit: 0, currency: "USD" },
    risk: "low",
    recommendation: "Test",
    confidence: 80,
    policyStatus: "ALLOWED",
    approvalStatus: "NOT_REQUIRED",
    action: { id: `act_${randomUUID()}`, type: "REALLOCATE_IDLE_CASH", target: "x", current: "x", proposed: "y", economicImpact: "x", risk: "low", amount: 1000, currency: "USD", isNewCounterparty: false, status: "READY", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" },
    status: "READY",
    createdAt: Date.now(),
    workerId,
    opportunityId,
  }
}

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

  it("org A cannot read org B's Opportunity by id, and listOpportunities never leaks across orgs", async () => {
    const orgA = await createOrganization(`Tenant Test A ${randomUUID()}`)
    const orgB = await createOrganization(`Tenant Test B ${randomUUID()}`)
    const workerA = buildEmptyWorker(`worker_${randomUUID()}`)
    await upsertWorker(workerA, orgA.id)

    const oppA = testOpportunity(workerA.id)
    await insertOpportunity(oppA, orgA.id)

    expect((await getOpportunity(oppA.id, orgA.id))?.id).toBe(oppA.id)
    expect(await getOpportunity(oppA.id, orgB.id)).toBeNull()

    const listA = await listOpportunities(orgA.id)
    const listB = await listOpportunities(orgB.id)
    expect(listA.map((o) => o.id)).toContain(oppA.id)
    expect(listB.map((o) => o.id)).not.toContain(oppA.id)
  })

  it("org A cannot read org B's Decision, and listDecisions never leaks across orgs", async () => {
    const orgA = await createOrganization(`Tenant Test A ${randomUUID()}`)
    const orgB = await createOrganization(`Tenant Test B ${randomUUID()}`)
    const workerA = buildEmptyWorker(`worker_${randomUUID()}`)
    await upsertWorker(workerA, orgA.id)

    const oppA = testOpportunity(workerA.id)
    await insertOpportunity(oppA, orgA.id)
    const decA = testDecision(workerA.id, oppA.id)
    await insertDecision(decA, orgA.id)

    const listA = await listDecisions(orgA.id)
    const listB = await listDecisions(orgB.id)
    expect(listA.map((d) => d.id)).toContain(decA.id)
    expect(listB.map((d) => d.id)).not.toContain(decA.id)
  })
})

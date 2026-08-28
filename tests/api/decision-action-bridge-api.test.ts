import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity, addEvidence } from "@/lib/knowledge/repo"
import { createDecision, decideOnDecision } from "@/lib/intelligence/decisions"
import { completeAction } from "@/lib/intelligence/actions"

/* §25/§29 — real, tenant-scoped API coverage for the Phase 7 Decision
 * -> Action bridge routes: exercising the real HTTP route handlers
 * (including the NotFoundError/ConflictError translation), not just
 * the underlying lib functions (already covered in
 * tests/integration/decision-action-bridge.test.ts). Only the NextAuth
 * session-verification step is mocked. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `dab-api-${randomUUID()}@example.test`
  const { user, org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  return { orgId: org.id, userId: user.id, email, projectId: project.id }
}

function mockSessionFor(tenant: Tenant) {
  vi.mocked(auth).mockResolvedValue({
    organizationId: tenant.orgId,
    organizationName: `Org ${tenant.email}`,
    user: { id: tenant.userId, email: tenant.email },
    expires: new Date(Date.now() + 3600_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

async function seedWellEvidencedEntity(orgId: string, projectId: string) {
  const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `API ${randomUUID()}`)
  await addEvidence({ orgId, projectId, entityId: entity.id, fact: "Real fact one.", sourceUrl: "https://example.test/a", sourceType: "crawl", confidence: 0.9 })
  await addEvidence({ orgId, projectId, entityId: entity.id, fact: "Real fact two.", sourceUrl: "https://example.test/b", sourceType: "crawl", confidence: 0.9 })
  return entity
}

let tenantA: Tenant
let tenantB: Tenant

beforeAll(async () => {
  tenantA = await setupTenant()
  tenantB = await setupTenant()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("Decision -> Action bridge API — real, functional (tenant A)", () => {
  it("GET .../decisions/:id/action-plan returns a real, side-effect-free preview", async () => {
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: { agentSteps: 7 }, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    const { GET } = await import("@/app/api/v1/intelligence/decisions/[id]/action-plan/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: decision.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan.status).toBe("supported")
    expect(body.plan.executionPolicy).toBe("workflow")
  })

  it("POST .../decisions/:id/execute refuses a non-approved decision with 409", async () => {
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    const { POST } = await import("@/app/api/v1/intelligence/decisions/[id]/execute/route")
    mockSessionFor(tenantA)
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: decision.id }) })
    expect(res.status).toBe(409)
  })

  it("POST .../decisions/:id/execute on an approved decision returns 202 with a real action + plan", async () => {
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, tenantA.orgId, "approved", "user_test")
    const { POST } = await import("@/app/api/v1/intelligence/decisions/[id]/execute/route")
    mockSessionFor(tenantA)
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: decision.id }) })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.action.status).toBe("queued")
    expect(body.action.decisionId).toBe(decision.id)

    const { GET: getAction } = await import("@/app/api/v1/intelligence/actions/[id]/route")
    const actionRes = await getAction(new Request("http://localhost/x"), { params: Promise.resolve({ id: body.action.id }) })
    expect(actionRes.status).toBe(200)
  })

  it("POST .../actions/:id/retry and /cancel work against a real action", async () => {
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, tenantA.orgId, "approved", "user_test")
    const { POST: execute } = await import("@/app/api/v1/intelligence/decisions/[id]/execute/route")
    mockSessionFor(tenantA)
    const execRes = await execute(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: decision.id }) })
    const { action } = await execRes.json()

    const { POST: cancel } = await import("@/app/api/v1/intelligence/actions/[id]/cancel/route")
    const cancelRes = await cancel(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: action.id }) })
    expect(cancelRes.status).toBe(200)
    const cancelledBody = await cancelRes.json()
    expect(cancelledBody.action.status).toBe("cancelled")

    await completeAction(action.id, tenantA.orgId, "failed", { error: "simulated" })
    const { POST: retry } = await import("@/app/api/v1/intelligence/actions/[id]/retry/route")
    const retryRes = await retry(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: action.id }) })
    expect(retryRes.status).toBe(202)
    const retryBody = await retryRes.json()
    expect(retryBody.action.retryOfActionId).toBe(action.id)
  })
})

describe("Decision -> Action bridge API — tenant isolation (§25)", () => {
  it("GET .../decisions/:id/action-plan 404s for another tenant's decision", async () => {
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    const { GET } = await import("@/app/api/v1/intelligence/decisions/[id]/action-plan/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: decision.id }) })
    expect(res.status).toBe(404)
  })

  it("POST .../decisions/:id/execute 404s for another tenant's decision — never creates a cross-tenant action", async () => {
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, tenantA.orgId, "approved", "user_test")
    const { POST } = await import("@/app/api/v1/intelligence/decisions/[id]/execute/route")
    mockSessionFor(tenantB)
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: decision.id }) })
    expect(res.status).toBe(404)
  })

  it("GET .../actions/:id, POST retry, and POST cancel all 404 for another tenant's action", async () => {
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, tenantA.orgId, "approved", "user_test")
    const { POST: execute } = await import("@/app/api/v1/intelligence/decisions/[id]/execute/route")
    mockSessionFor(tenantA)
    const execRes = await execute(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: decision.id }) })
    const { action } = await execRes.json()

    mockSessionFor(tenantB)
    const { GET: getAction } = await import("@/app/api/v1/intelligence/actions/[id]/route")
    expect((await getAction(new Request("http://localhost/x"), { params: Promise.resolve({ id: action.id }) })).status).toBe(404)

    const { POST: retry } = await import("@/app/api/v1/intelligence/actions/[id]/retry/route")
    expect((await retry(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: action.id }) })).status).toBe(404)

    const { POST: cancel } = await import("@/app/api/v1/intelligence/actions/[id]/cancel/route")
    expect((await cancel(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: action.id }) })).status).toBe(404)

    mockSessionFor(tenantA)
    const { GET: getActionAsOwner } = await import("@/app/api/v1/intelligence/actions/[id]/route")
    const ownerRes = await getActionAsOwner(new Request("http://localhost/x"), { params: Promise.resolve({ id: action.id }) })
    const ownerBody = await ownerRes.json()
    expect(ownerBody.action.status).not.toBe("cancelled") // tenant B's cancel attempt did nothing real
  })
})

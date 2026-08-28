import { randomUUID } from "node:crypto"
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity, createRelationship, addEvidence } from "@/lib/knowledge/repo"
import { createOpportunity } from "@/lib/opportunity/repo"
import { createDecision } from "@/lib/intelligence/decisions"
import { workflowEngine } from "@/lib/workflow/engine"

/* Real, tenant-scoped API coverage for GET /api/v1/objects/:type/:id
 * (Phase UI-1/4/5) — the shared read behind the universal Object
 * Inspector. Only the NextAuth session-verification step is mocked;
 * requireSession()'s real membership check still runs. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `objects-${randomUUID()}@example.test`
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

let tenantA: Tenant
let tenantB: Tenant
let entityId: string
let relatedEntityId: string
let opportunityId: string
let decisionId: string

beforeAll(async () => {
  tenantA = await setupTenant()
  tenantB = await setupTenant()

  const { entity } = await resolveOrCreateEntity(tenantA.orgId, tenantA.projectId, "Place", `Objects API Place ${randomUUID()}`)
  entityId = entity.id
  const { entity: related } = await resolveOrCreateEntity(tenantA.orgId, tenantA.projectId, "Role", `Objects API Role ${randomUUID()}`)
  relatedEntityId = related.id
  await createRelationship({ orgId: tenantA.orgId, projectId: tenantA.projectId, sourceEntityId: entityId, targetEntityId: relatedEntityId, relationshipType: "TARGETS_ROLE", source: "test" })
  await addEvidence({ orgId: tenantA.orgId, projectId: tenantA.projectId, entityId, fact: "A real test fact about this entity.", sourceType: "web_search", confidence: 0.8 })

  const run = await workflowEngine.start({ orgId: tenantA.orgId, projectId: tenantA.projectId, pipeline: "trend_analysis", subjectType: "project", subjectId: tenantA.projectId })
  const opportunity = await createOpportunity({
    orgId: tenantA.orgId,
    projectId: tenantA.projectId,
    sourceAgentRunId: run.id,
    primaryEntityId: entityId,
    title: "Objects API test opportunity",
    topic: "test topic",
    outline: [],
    scores: { sourceGroundingScore: null, outlineCompletenessScore: null, confidenceScore: 0.7, entityCoverageScore: null, demandScore: null, trendScore: null, businessValueScore: 60, competitionScore: null, authorityGapScore: null, informationGainScore: null, citationPotentialScore: null, cannibalizationRiskScore: null },
    finalScore: 60,
    scoreNotes: null,
  })
  opportunityId = opportunity.id

  const decision = await createDecision({
    orgId: tenantA.orgId,
    projectId: tenantA.projectId,
    action: "CREATE_PAGE",
    subjectType: "entity",
    subjectId: entityId,
    reason: "Objects API test decision reason.",
    evidenceIds: [],
    expectedImpact: "Real expected impact.",
    estimatedCost: { tokens: 1000, usd: 0.05, agentSteps: 5 },
    risk: "low",
    confidence: 0.75,
    requiredApproval: true,
  })
  decisionId = decision.id
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("GET /api/v1/objects/:type/:id", () => {
  it("resolves a real entity with its real relationships and evidence", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "entity", id: entityId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.object.type).toBe("entity")
    expect(body.object.relationships.some((r: { targetId: string }) => r.targetId === relatedEntityId)).toBe(true)
    expect(body.object.evidence.length).toBeGreaterThanOrEqual(1)
  })

  it("resolves a real opportunity, including its real targets-entity relationship", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "opportunity", id: opportunityId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.object.score).toBe(60)
    expect(body.object.relationships.some((r: { targetId: string; relation: string }) => r.targetId === entityId && r.relation === "targets")).toBe(true)
  })

  it("resolves a real decision with its real confidence and status", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "decision", id: decisionId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.object.status).toBe("pending")
    expect(body.object.confidence).toBe(0.75)
  })

  it("rejects an unknown object type with a real validation error", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "not_a_real_type", id: entityId }) })
    expect(res.status).toBe(400)
  })

  it("404s for a real id that does not exist", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "entity", id: `ent_${randomUUID()}` }) })
    expect(res.status).toBe(404)
  })

  it("tenant isolation: tenant B's session 404s on tenant A's real entity", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "entity", id: entityId }) })
    expect(res.status).toBe(404)
  })

  it("tenant isolation: tenant B's session 404s on tenant A's real opportunity and decision", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    mockSessionFor(tenantB)
    const oppRes = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "opportunity", id: opportunityId }) })
    expect(oppRes.status).toBe(404)
    const decRes = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ type: "decision", id: decisionId }) })
    expect(decRes.status).toBe(404)
  })
})

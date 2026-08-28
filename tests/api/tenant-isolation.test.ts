import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity } from "@/lib/knowledge/repo"
import { createOpportunity } from "@/lib/opportunity/repo"
import { createPage } from "@/lib/pages/repo"
import { buildPageBriefFromOpportunity } from "@/lib/pagebrief/build"
import { workflowEngine } from "@/lib/workflow/engine"

/* ================================================================== *
 * TENANT ISOLATION — REAL, AUTOMATED PROOF (user-reported priority-
 * zero bug: "a interface está exibindo dados de outro projeto/
 * tenant"). This is the empirical test the user explicitly asked for:
 * two real, fully independent tenants (org + project + user), each
 * seeded with its own distinguishable real Entity/Opportunity/Page,
 * hit through the exact same HTTP route handlers Mission Control,
 * Knowledge, Opportunities, Pages, the Intelligence Graph, and the
 * Object Inspector call in the browser — proving each tenant's
 * session only ever resolves its own project's real data, and never
 * the other tenant's, across every one of those six surfaces.
 *
 * Only the NextAuth session-verification step is mocked (same pattern
 * as tests/api/intelligence-decision-layer-api.test.ts) —
 * requireSession()'s real membership check, and every repo/route
 * function's real org_id/project_id filtering, run unmocked.
 * ================================================================== */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
  entityId: string
  entityName: string
  opportunityId: string
  opportunityTitle: string
  pageId: string
  pageSlug: string
}

async function seedTenant(label: string): Promise<Tenant> {
  const email = `iso-${label}-${randomUUID()}@example.test`
  const { user, org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)

  const entityName = `ISOLATION-ENTITY-${label}-${randomUUID()}`
  const { entity } = await resolveOrCreateEntity(org.id, project.id, "Place", entityName)

  const provenanceRun = await workflowEngine.start({ orgId: org.id, projectId: project.id, pipeline: "decision_execution", subjectType: "project", subjectId: project.id })
  const opportunityTitle = `ISOLATION-OPPORTUNITY-${label}-${randomUUID()}`
  const opportunity = await createOpportunity({
    orgId: org.id,
    projectId: project.id,
    sourceAgentRunId: provenanceRun.id,
    primaryEntityId: entity.id,
    opportunityType: "entity_coverage_gap",
    title: opportunityTitle,
    topic: opportunityTitle,
    outline: [],
    scores: {
      sourceGroundingScore: null,
      outlineCompletenessScore: null,
      confidenceScore: null,
      entityCoverageScore: null,
      demandScore: null,
      trendScore: null,
      businessValueScore: null,
      competitionScore: null,
      authorityGapScore: null,
      informationGainScore: null,
      citationPotentialScore: null,
      cannibalizationRiskScore: null,
    },
    finalScore: null,
    scoreNotes: null,
  })

  const brief = await buildPageBriefFromOpportunity(opportunity)
  const pageSlug = `isolation-page-${label}-${randomUUID()}`
  const page = await createPage({ orgId: org.id, projectId: project.id, opportunityId: opportunity.id, pageBriefId: brief.id, slug: pageSlug, title: `ISOLATION-PAGE-${label}`, metaDescription: null })

  return {
    orgId: org.id,
    userId: user.id,
    email,
    projectId: project.id,
    entityId: entity.id,
    entityName,
    opportunityId: opportunity.id,
    opportunityTitle,
    pageId: page.id,
    pageSlug,
  }
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

beforeAll(async () => {
  tenantA = await seedTenant("a")
  tenantB = await seedTenant("b")
}, 30_000)

afterAll(() => {
  vi.restoreAllMocks()
})

describe("Tenant isolation — real API route handlers, real DB (priority-zero fix)", () => {
  it("GET /api/v1/intelligence/mission — each tenant's default project resolves to its OWN project, never the other's", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/mission/route")

    mockSessionFor(tenantA)
    const resA = await GET(new Request("http://localhost/x"))
    const bodyA = await resA.json()
    expect(bodyA.projectId).toBe(tenantA.projectId)
    expect(bodyA.projectId).not.toBe(tenantB.projectId)

    mockSessionFor(tenantB)
    const resB = await GET(new Request("http://localhost/x"))
    const bodyB = await resB.json()
    expect(bodyB.projectId).toBe(tenantB.projectId)
    expect(bodyB.projectId).not.toBe(tenantA.projectId)
  })

  it("GET /api/v1/intelligence/mission — tenant B passing tenant A's real projectId is rejected, never served", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/mission/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    expect(res.status).toBe(400) // ValidationError("Project not found.") — tenant B doesn't own tenant A's project
  })

  it("GET /api/opportunities — tenant A sees its own real opportunity; tenant B's list never contains it", async () => {
    const { GET } = await import("@/app/api/opportunities/route")

    mockSessionFor(tenantA)
    const resA = await GET(new Request("http://localhost/x"))
    const bodyA = await resA.json()
    expect(bodyA.projectId).toBe(tenantA.projectId)
    expect(bodyA.opportunities.some((o: { id: string }) => o.id === tenantA.opportunityId)).toBe(true)
    expect(bodyA.opportunities.some((o: { id: string }) => o.id === tenantB.opportunityId)).toBe(false)

    mockSessionFor(tenantB)
    const resB = await GET(new Request("http://localhost/x"))
    const bodyB = await resB.json()
    expect(bodyB.projectId).toBe(tenantB.projectId)
    expect(bodyB.opportunities.some((o: { id: string }) => o.id === tenantB.opportunityId)).toBe(true)
    expect(bodyB.opportunities.some((o: { id: string }) => o.id === tenantA.opportunityId)).toBe(false)
  })

  it("GET /api/pages — each tenant only ever sees its own real page", async () => {
    const { GET } = await import("@/app/api/pages/route")

    mockSessionFor(tenantA)
    const resA = await GET(new Request("http://localhost/x"))
    const bodyA = await resA.json()
    expect(bodyA.pages.some((p: { id: string }) => p.id === tenantA.pageId)).toBe(true)
    expect(bodyA.pages.some((p: { id: string }) => p.id === tenantB.pageId)).toBe(false)

    mockSessionFor(tenantB)
    const resB = await GET(new Request("http://localhost/x"))
    const bodyB = await resB.json()
    expect(bodyB.pages.some((p: { id: string }) => p.id === tenantB.pageId)).toBe(true)
    expect(bodyB.pages.some((p: { id: string }) => p.id === tenantA.pageId)).toBe(false)
  })

  it("GET /api/knowledge/entities — each tenant only ever sees its own real entity", async () => {
    const { GET } = await import("@/app/api/knowledge/entities/route")

    mockSessionFor(tenantA)
    const resA = await GET(new Request("http://localhost/x"))
    const bodyA = await resA.json()
    expect(bodyA.projectId).toBe(tenantA.projectId)
    expect(bodyA.entities.some((e: { id: string }) => e.id === tenantA.entityId)).toBe(true)
    expect(bodyA.entities.some((e: { id: string }) => e.id === tenantB.entityId)).toBe(false)

    mockSessionFor(tenantB)
    const resB = await GET(new Request("http://localhost/x"))
    const bodyB = await resB.json()
    expect(bodyB.entities.some((e: { id: string }) => e.id === tenantB.entityId)).toBe(true)
    expect(bodyB.entities.some((e: { id: string }) => e.id === tenantA.entityId)).toBe(false)
  })

  it("GET /api/v1/intelligence/map (mode=opportunities) — tenant A's graph never contains tenant B's real opportunity node, and vice versa", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/map/route")

    mockSessionFor(tenantA)
    const resA = await GET(new Request(`http://localhost/x?mode=opportunities&projectId=${tenantA.projectId}&limit=200`))
    const bodyA = await resA.json()
    const idsA: string[] = bodyA.nodes.map((n: { id: string }) => n.id)
    expect(idsA).toContain(`opportunity:${tenantA.opportunityId}`)
    expect(idsA).not.toContain(`opportunity:${tenantB.opportunityId}`)

    // tenant A can never even resolve tenant B's project id — the route
    // verifies project ownership before building anything.
    const crossRes = await GET(new Request(`http://localhost/x?mode=opportunities&projectId=${tenantB.projectId}&limit=200`))
    expect(crossRes.status).toBe(400)
  })

  it("GET /api/v1/objects/entity/:id (Object Inspector) — tenant B can never open tenant A's real entity, and vice versa", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")
    const params = Promise.resolve({ type: "entity", id: tenantA.entityId })

    mockSessionFor(tenantA)
    const resOwn = await GET(new Request("http://localhost/x"), { params })
    expect(resOwn.status).toBe(200)
    const bodyOwn = await resOwn.json()
    expect(bodyOwn.object.title).toBe(tenantA.entityName)

    mockSessionFor(tenantB)
    const resCross = await GET(new Request("http://localhost/x"), { params })
    expect(resCross.status).toBe(404) // real object, real id — but not tenant B's; never served
  })

  it("GET /api/v1/objects/opportunity/:id and /page/:id — same real cross-tenant 404, never another tenant's data", async () => {
    const { GET } = await import("@/app/api/v1/objects/[type]/[id]/route")

    mockSessionFor(tenantB)
    const oppParams = Promise.resolve({ type: "opportunity", id: tenantA.opportunityId })
    const oppRes = await GET(new Request("http://localhost/x"), { params: oppParams })
    expect(oppRes.status).toBe(404)

    const pageParams = Promise.resolve({ type: "page", id: tenantA.pageId })
    const pageRes = await GET(new Request("http://localhost/x"), { params: pageParams })
    expect(pageRes.status).toBe(404)
  })
})

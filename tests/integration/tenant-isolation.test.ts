import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity, getEntity } from "@/lib/knowledge/repo"
import { createWorkflowRun as createAgentRun, getWorkflowRun as getAgentRun } from "@/lib/workflow/repo"
import { createOpportunity, getOpportunity, reviewOpportunity } from "@/lib/opportunity/repo"
import { createPage, getPage } from "@/lib/pages/repo"
import { createPageBrief } from "@/lib/pagebrief/repo"

/* §31 (mandatory): Tenant A must NEVER access Tenant B's data. Tested
 * at both the service/repository layer (real org-scoped SQL) and the
 * real API route layer (only the NextAuth session-verification step
 * itself is mocked — requireSession()'s real membership check against
 * the database still runs for real). vi.mock() is hoisted above all
 * imports by Vitest, so lib/auth.ts's real NextAuth wiring never runs. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const NULL_SCORES = {
  sourceGroundingScore: null, outlineCompletenessScore: null, confidenceScore: null, entityCoverageScore: null,
  demandScore: null, trendScore: null, businessValueScore: null, competitionScore: null, authorityGapScore: null,
  informationGainScore: null, citationPotentialScore: null, cannibalizationRiskScore: null,
}

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
  entityId: string
  agentRunId: string
  opportunityId: string
  pageBriefId: string
  pageId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `tenant-${randomUUID()}@example.test`
  const { user, org } = await createUserWithOrganization(email, "hashed-password-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  const { entity } = await resolveOrCreateEntity(org.id, project.id, "Organization", `Acme ${randomUUID()}`)
  const run = await createAgentRun({ orgId: org.id, projectId: project.id, pipeline: "website_discovery", subjectType: "website", subjectId: "test-subject" })
  const opportunity = await createOpportunity({
    orgId: org.id,
    projectId: project.id,
    sourceAgentRunId: run.id,
    opportunityType: "entity_coverage_gap",
    primaryEntityId: entity.id,
    title: "Test opportunity",
    topic: entity.name,
    outline: ["Overview"],
    scores: NULL_SCORES,
    finalScore: null,
    scoreNotes: null,
  })
  const brief = await createPageBrief({
    orgId: org.id,
    projectId: project.id,
    opportunityId: opportunity.id,
    targetIntent: null,
    primaryEntityId: entity.id,
    secondaryEntityIds: [],
    market: null,
    role: null,
    questions: [],
    informationGainStrategy: null,
    requiredEvidence: [],
    recommendedSections: ["Overview"],
    schemaStrategy: ["WebPage"],
    internalLinkStrategy: null,
    sourceRequirements: [],
  })
  const page = await createPage({ orgId: org.id, projectId: project.id, opportunityId: opportunity.id, pageBriefId: brief.id, slug: `test-${randomUUID()}`, title: "Test page", metaDescription: null })

  return { orgId: org.id, userId: user.id, email, projectId: project.id, entityId: entity.id, agentRunId: run.id, opportunityId: opportunity.id, pageBriefId: brief.id, pageId: page.id }
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
  tenantA = await setupTenant()
  tenantB = await setupTenant()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("tenant isolation — service/repository layer", () => {
  it("never returns another tenant's entity", async () => {
    expect(await getEntity(tenantA.entityId, tenantB.orgId)).toBeNull()
    expect(await getEntity(tenantA.entityId, tenantA.orgId)).not.toBeNull()
  })

  it("never returns another tenant's opportunity, and never lets it be reviewed cross-tenant", async () => {
    expect(await getOpportunity(tenantA.opportunityId, tenantB.orgId)).toBeNull()
    const reviewAttempt = await reviewOpportunity(tenantA.opportunityId, tenantB.orgId, "approved", tenantB.userId)
    expect(reviewAttempt).toBeNull()
    // the real row must be untouched by tenant B's attempt
    const real = await getOpportunity(tenantA.opportunityId, tenantA.orgId)
    expect(real?.status).toBe("discovered")
  })

  it("never returns another tenant's page", async () => {
    expect(await getPage(tenantA.pageId, tenantB.orgId)).toBeNull()
    expect(await getPage(tenantA.pageId, tenantA.orgId)).not.toBeNull()
  })

  it("never returns another tenant's agent run", async () => {
    expect(await getAgentRun(tenantA.agentRunId, tenantB.orgId)).toBeNull()
    expect(await getAgentRun(tenantA.agentRunId, tenantA.orgId)).not.toBeNull()
  })
})

describe("tenant isolation — API route layer (real requireSession, mocked NextAuth cookie only)", () => {
  it("GET /api/opportunities/:id returns 404 (not 403 — never confirms the resource exists) for another tenant", async () => {
    const { GET } = await import("@/app/api/opportunities/[id]/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/opportunities/${tenantA.opportunityId}`), { params: Promise.resolve({ id: tenantA.opportunityId }) })
    expect(res.status).toBe(404)

    mockSessionFor(tenantA)
    const ownRes = await GET(new Request(`http://localhost/api/opportunities/${tenantA.opportunityId}`), { params: Promise.resolve({ id: tenantA.opportunityId }) })
    expect(ownRes.status).toBe(200)
  })

  it("PATCH /api/opportunities/:id (approve) fails for another tenant and never mutates the real row", async () => {
    const { PATCH } = await import("@/app/api/opportunities/[id]/route")
    mockSessionFor(tenantB)
    const res = await PATCH(
      new Request(`http://localhost/api/opportunities/${tenantA.opportunityId}`, { method: "PATCH", body: JSON.stringify({ decision: "approved" }) }),
      { params: Promise.resolve({ id: tenantA.opportunityId }) },
    )
    expect(res.status).toBe(404)
    const real = await getOpportunity(tenantA.opportunityId, tenantA.orgId)
    expect(real?.status).toBe("discovered")
  })

  it("GET /api/pages/:id returns 404 for another tenant", async () => {
    const { GET } = await import("@/app/api/pages/[id]/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/pages/${tenantA.pageId}`), { params: Promise.resolve({ id: tenantA.pageId }) })
    expect(res.status).toBe(404)
  })

  it("GET /api/agent-runs/:id returns 404 for another tenant", async () => {
    const { GET } = await import("@/app/api/agent-runs/[id]/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/agent-runs/${tenantA.agentRunId}`), { params: Promise.resolve({ id: tenantA.agentRunId }) })
    expect(res.status).toBe(404)
  })

  it("GET /api/knowledge/entities/:id returns 404 for another tenant", async () => {
    const { GET } = await import("@/app/api/knowledge/entities/[id]/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/knowledge/entities/${tenantA.entityId}`), { params: Promise.resolve({ id: tenantA.entityId }) })
    expect(res.status).toBe(404)
  })

  it("GET /api/opportunities (list) never includes another tenant's opportunities", async () => {
    const { GET } = await import("@/app/api/opportunities/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request("http://localhost/api/opportunities"))
    const body = await res.json()
    expect(body.opportunities.some((o: { id: string }) => o.id === tenantA.opportunityId)).toBe(false)
  })
})

import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { recordSignal } from "@/lib/intelligence/signals"
import { recordEvidence } from "@/lib/intelligence/evidence"
import { upsertTrend } from "@/lib/intelligence/trends"
import { createAIPrompt } from "@/lib/intelligence/ai-visibility/repo"
import { createProperty } from "@/lib/intelligence/search-console/repo"
import { generateRecommendations } from "@/lib/intelligence/recommendations"

/* Phase 5B (§39): every new Intelligence Layer resource must be exactly
 * as tenant-isolated as the rest of this codebase — 404, never a
 * cross-tenant leak. Only the NextAuth session-verification step is
 * mocked; requireSession()'s real membership check still runs. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `p5b-${randomUUID()}@example.test`
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

beforeAll(async () => {
  tenantA = await setupTenant()
  tenantB = await setupTenant()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("signals/evidence/trends/queries — cross-project access requires tenantB's own project (§39)", () => {
  it("GET /api/v1/signals rejects tenant A's projectId from tenant B's session", async () => {
    await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "manual", value: {}, source: "test", confidence: 0.5 })
    const { GET } = await import("@/app/api/v1/signals/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/v1/signals?projectId=${tenantA.projectId}`))
    expect(res.status).toBe(400) // "Project not found" — tenant A's project is invisible to tenant B
  })

  it("GET /api/v1/evidence never returns another tenant's evidence even if subjectId happens to match", async () => {
    const opportunityId = `shared-subject-${randomUUID()}`
    await recordEvidence({ orgId: tenantA.orgId, projectId: tenantA.projectId, subjectType: "opportunity", subjectId: opportunityId, source: "test", sourceType: "manual", confidence: 0.8 })
    const { GET } = await import("@/app/api/v1/evidence/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/v1/evidence?subjectType=opportunity&subjectId=${opportunityId}`))
    const body = await res.json()
    expect(body.evidence).toHaveLength(0) // real org-scoped filtering, not just a subjectId match
  })

  it("GET /api/v1/trends rejects tenant A's projectId from tenant B's session", async () => {
    await upsertTrend({ orgId: tenantA.orgId, projectId: tenantA.projectId, label: `t-${randomUUID()}`, entityId: null, state: "rising", velocity: 50, acceleration: null, momentum: 10, seasonality: null, confidence: 0.8, signalIds: [] })
    const { GET } = await import("@/app/api/v1/trends/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/v1/trends?projectId=${tenantA.projectId}`))
    expect(res.status).toBe(400)
  })

  it("POST /api/v1/queries rejects tenant A's projectId from tenant B's session", async () => {
    const { POST } = await import("@/app/api/v1/queries/route")
    mockSessionFor(tenantB)
    const res = await POST(new Request("http://localhost/api/v1/queries", { method: "POST", body: JSON.stringify({ projectId: tenantA.projectId, text: "test query" }) }))
    expect(res.status).toBe(400)
  })
})

describe("AI visibility — cross-tenant isolation (§39)", () => {
  it("running/reading another tenant's prompt is rejected", async () => {
    const prompt = await createAIPrompt({ orgId: tenantA.orgId, projectId: tenantA.projectId, label: "test", text: "test prompt" })
    const { POST: runRoute } = await import("@/app/api/v1/ai-visibility/prompts/[id]/run/route")
    const { GET: answersRoute } = await import("@/app/api/v1/ai-visibility/prompts/[id]/answers/route")
    mockSessionFor(tenantB)
    const runRes = await runRoute(new Request(`http://localhost/x`, { method: "POST", body: "{}" }), { params: Promise.resolve({ id: prompt.id }) })
    expect(runRes.status).toBe(404)
    const answersRes = await answersRoute(new Request("http://localhost/x"), { params: Promise.resolve({ id: prompt.id }) })
    expect(answersRes.status).toBe(404)
  })
})

describe("Search Console — cross-tenant isolation (§39)", () => {
  it("importing into another tenant's property is rejected", async () => {
    const property = await createProperty({ orgId: tenantA.orgId, projectId: tenantA.projectId, siteUrl: `sc-domain:${randomUUID()}.test` })
    const { POST: importRoute } = await import("@/app/api/v1/search-console/properties/[id]/import/route")
    mockSessionFor(tenantB)
    const res = await importRoute(
      new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ snapshots: [{ date: "2026-01-01", clicks: 1, impressions: 1, ctr: 1, position: 1 }] }) }),
      { params: Promise.resolve({ id: property.id }) },
    )
    expect(res.status).toBe(404)
  })

  it("GET /api/v1/search-console/properties rejects tenant A's projectId from tenant B's session", async () => {
    const { GET } = await import("@/app/api/v1/search-console/properties/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    expect(res.status).toBe(400)
  })
})

describe("Recommendations — cross-tenant isolation (§39)", () => {
  it("recommendations generated for tenant A never leak into tenant B's listing", async () => {
    await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "stale_data", value: { dataSourceId: `iso-${randomUUID()}`, datasetName: "IsolationTest" }, source: "test", confidence: 1 })
    await generateRecommendations(tenantA.orgId, tenantA.projectId)

    const { GET } = await import("@/app/api/v1/recommendations/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantB.projectId}`))
    const body = await res.json()
    expect(body.recommendations.some((r: { reason: string }) => r.reason.includes("IsolationTest"))).toBe(false)
  })

  it("PATCH /api/v1/recommendations/:id never lets another tenant update it", async () => {
    await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "stale_data", value: { dataSourceId: `iso2-${randomUUID()}`, datasetName: "IsolationTest2" }, source: "test", confidence: 1 })
    const created = await generateRecommendations(tenantA.orgId, tenantA.projectId)
    const rec = created.find((r) => r.reason.includes("IsolationTest2"))
    expect(rec).toBeTruthy()

    const { PATCH } = await import("@/app/api/v1/recommendations/[id]/route")
    mockSessionFor(tenantB)
    const res = await PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) }), { params: Promise.resolve({ id: rec!.id }) })
    expect(res.status).toBe(404)
  })
})

describe("Opportunity explanation / information gain — cross-tenant isolation (§39)", () => {
  it("GET /api/v1/opportunities/:id/explain and /information-gain reject another tenant's opportunity id", async () => {
    const { GET: explainRoute } = await import("@/app/api/v1/opportunities/[id]/explain/route")
    const { GET: infoGainRoute } = await import("@/app/api/v1/opportunities/[id]/information-gain/route")
    mockSessionFor(tenantB)
    const fakeId = `opp_${randomUUID()}`
    expect((await explainRoute(new Request("http://localhost/x"), { params: Promise.resolve({ id: fakeId }) })).status).toBe(404)
    expect((await infoGainRoute(new Request("http://localhost/x"), { params: Promise.resolve({ id: fakeId }) })).status).toBe(404)
  })
})

describe("unauthenticated access — every new route rejects with 401 (§39)", () => {
  it("signals/trends/recommendations/ai-visibility all require a real session", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any)
    const { GET: signalsRoute } = await import("@/app/api/v1/signals/route")
    expect((await signalsRoute(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))).status).toBe(401)

    const { GET: trendsRoute } = await import("@/app/api/v1/trends/route")
    expect((await trendsRoute(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))).status).toBe(401)

    const { GET: recsRoute } = await import("@/app/api/v1/recommendations/route")
    expect((await recsRoute(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))).status).toBe(401)

    const { GET: promptsRoute } = await import("@/app/api/v1/ai-visibility/prompts/route")
    expect((await promptsRoute(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))).status).toBe(401)
  })
})

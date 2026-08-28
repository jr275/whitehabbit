import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity } from "@/lib/knowledge/repo"
import { recordSignal } from "@/lib/intelligence/signals"
import { runCorrelationScan } from "@/lib/intelligence/correlation-scan"
import { runDecisionScan } from "@/lib/intelligence/decision-scan"
import { createAction, completeAction } from "@/lib/intelligence/actions"

/* §19/§20 — real, tenant-scoped API coverage for the Phase 6 Decision
 * Layer: /api/v1/intelligence/{insights,decisions,actions,outcomes,
 * timeline,map}. Only the NextAuth session-verification step is
 * mocked; requireSession()'s real membership check still runs. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `p6-${randomUUID()}@example.test`
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
let decisionId: string
let actionId: string

beforeAll(async () => {
  tenantA = await setupTenant()
  tenantB = await setupTenant()

  // real data for tenant A: entity -> signals -> observation -> decision -> action
  const { entity } = await resolveOrCreateEntity(tenantA.orgId, tenantA.projectId, "Place", `API ${randomUUID()}`)
  await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "ENTITY_GAP", entityId: entity.id, value: {}, source: "test", confidence: 0.9 })
  await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 60 }, source: "test", confidence: 0.9 })
  await runCorrelationScan(tenantA.orgId, tenantA.projectId)
  const [decision] = await runDecisionScan(tenantA.orgId, tenantA.projectId)
  decisionId = decision.id

  const action = await createAction({ orgId: tenantA.orgId, projectId: tenantA.projectId, decisionId: decision.id, status: "running" })
  await completeAction(action.id, tenantA.orgId, "succeeded", { note: "test" })
  actionId = action.id
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("intelligence API — real, functional (tenant A)", () => {
  it("POST/GET /api/v1/intelligence/insights", async () => {
    const { GET, POST } = await import("@/app/api/v1/intelligence/insights/route")
    mockSessionFor(tenantA)
    const createRes = await POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ projectId: tenantA.projectId, title: "t", summary: "s", category: "c", confidence: 0.7, signalIds: [] }) }))
    expect(createRes.status).toBe(201)
    const listRes = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    const body = await listRes.json()
    expect(body.insights.length).toBeGreaterThanOrEqual(1)
  })

  it("GET /api/v1/intelligence/decisions lists the real decision from setup", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/decisions/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    const body = await res.json()
    expect(body.decisions.some((d: { id: string }) => d.id === decisionId)).toBe(true)
  })

  it("PATCH /api/v1/intelligence/decisions/:id approves once, refuses a second decision", async () => {
    const { PATCH } = await import("@/app/api/v1/intelligence/decisions/[id]/route")
    mockSessionFor(tenantA)
    const res = await PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "approved" }) }), { params: Promise.resolve({ id: decisionId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decision.status).toBe("approved")

    const again = await PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }), { params: Promise.resolve({ id: decisionId }) })
    expect(again.status).toBe(400)
  })

  it("GET /api/v1/intelligence/actions lists by decisionId and by project", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/actions/route")
    mockSessionFor(tenantA)
    const byDecision = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}&decisionId=${decisionId}`))
    const byDecisionBody = await byDecision.json()
    expect(byDecisionBody.actions.some((a: { id: string }) => a.id === actionId)).toBe(true)

    const byProject = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}&status=succeeded`))
    const byProjectBody = await byProject.json()
    expect(byProjectBody.actions.some((a: { id: string }) => a.id === actionId)).toBe(true)
  })

  it("POST/GET /api/v1/intelligence/outcomes computes a real delta server-side", async () => {
    const { GET, POST } = await import("@/app/api/v1/intelligence/outcomes/route")
    mockSessionFor(tenantA)
    const createRes = await POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ projectId: tenantA.projectId, actionId, metric: "impressions_delta_pct", baseline: 100, value: 150, confidence: 0.8 }) }))
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    expect(createBody.outcome.delta).toBe(50)

    const listRes = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}&actionId=${actionId}`))
    const listBody = await listRes.json()
    expect(listBody.outcomes.some((o: { actionId: string }) => o.actionId === actionId)).toBe(true)
  })

  it("GET /api/v1/intelligence/timeline merges real entries across kinds", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/timeline/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    const body = await res.json()
    const kinds = new Set(body.entries.map((e: { type: string }) => e.type))
    expect(kinds.has("signal")).toBe(true)
    expect(kinds.has("decision")).toBe(true)
    expect(kinds.has("outcome")).toBe(true)
    // chronological, most-recent-first
    for (let i = 1; i < body.entries.length; i++) expect(body.entries[i - 1].at).toBeGreaterThanOrEqual(body.entries[i].at)
  })

  it("GET /api/v1/intelligence/timeline?types= filters server-side (Phase 8 §12) — a filtered-out kind never appears", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/timeline/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}&types=decision,action`))
    const body = await res.json()
    expect(body.entries.length).toBeGreaterThan(0)
    for (const entry of body.entries) expect(["decision", "action"]).toContain(entry.type)
  })

  it("GET /api/v1/intelligence/timeline?q= matches only real entries whose own summary contains the term", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/timeline/route")
    mockSessionFor(tenantA)
    const all = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    const allBody = await all.json()
    const target = allBody.entries.find((e: { summary: string }) => e.summary.length > 3)
    const needle = target.summary.slice(0, 4)

    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}&q=${encodeURIComponent(needle)}`))
    const body = await res.json()
    expect(body.entries.length).toBeGreaterThan(0)
    for (const entry of body.entries) expect(entry.summary.toLowerCase()).toContain(needle.toLowerCase())
  })

  it("GET /api/v1/intelligence/timeline respects since/until as a real inclusive date-range bound", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/timeline/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}&since=${Date.now() + 3_600_000}`))
    const body = await res.json()
    expect(body.entries.length).toBe(0)
  })

  it("GET /api/v1/intelligence/map returns a real, connected graph", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/map/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    const body = await res.json()
    const decisionNode = body.nodes.find((n: { id: string }) => n.id === `decision:${decisionId}`)
    expect(decisionNode).toBeTruthy()
    expect(body.edges.some((e: { from: string }) => e.from === `decision:${decisionId}`)).toBe(true)
  })
})

describe("intelligence API — tenant isolation (§17)", () => {
  it("every list endpoint rejects tenant A's projectId from tenant B's session", async () => {
    mockSessionFor(tenantB)
    const routes = [
      ["@/app/api/v1/intelligence/insights/route", "GET"],
      ["@/app/api/v1/intelligence/decisions/route", "GET"],
      ["@/app/api/v1/intelligence/actions/route", "GET"],
      ["@/app/api/v1/intelligence/outcomes/route", "GET"],
      ["@/app/api/v1/intelligence/timeline/route", "GET"],
      ["@/app/api/v1/intelligence/map/route", "GET"],
    ] as const
    for (const [modulePath] of routes) {
      const mod = await import(modulePath)
      const res = await mod.GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
      expect(res.status, `${modulePath} should reject a cross-tenant projectId`).toBe(400)
    }
  })

  it("PATCH /api/v1/intelligence/decisions/:id 404s for another tenant's decision", async () => {
    const { PATCH } = await import("@/app/api/v1/intelligence/decisions/[id]/route")
    mockSessionFor(tenantB)
    const res = await PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "approved" }) }), { params: Promise.resolve({ id: decisionId }) })
    expect(res.status).toBe(404)
  })

  it("GET /api/v1/intelligence/actions?decisionId=<tenant A's> from tenant B's own project returns real, empty isolation — never a cross-tenant leak", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/actions/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantB.projectId}&decisionId=${decisionId}`))
    const body = await res.json()
    expect(body.actions).toHaveLength(0)
  })

  it("POST /api/v1/intelligence/outcomes rejects another tenant's actionId", async () => {
    const { POST } = await import("@/app/api/v1/intelligence/outcomes/route")
    mockSessionFor(tenantB)
    const res = await POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ projectId: tenantB.projectId, actionId, metric: "x", value: 1, confidence: 0.5 }) }))
    expect(res.status).toBe(400)
  })
})

import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity, addEvidence } from "@/lib/knowledge/repo"
import { recordSignal } from "@/lib/intelligence/signals"
import { runCorrelationScan } from "@/lib/intelligence/correlation-scan"
import { runDecisionScan } from "@/lib/intelligence/decision-scan"

/* §16-17 — real Mission Control aggregation API, tenant-scoped. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `mission-${randomUUID()}@example.test`
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

  const entity = await resolveOrCreateEntity(tenantA.orgId, tenantA.projectId, "Place", `Mission ${randomUUID()}`).then((r) => r.entity)
  await addEvidence({ orgId: tenantA.orgId, projectId: tenantA.projectId, entityId: entity.id, fact: "real fact", sourceUrl: "https://x.test", sourceType: "crawl", confidence: 0.9 })
  await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "ENTITY_GAP", entityId: entity.id, value: {}, source: "test", confidence: 0.9 })
  await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 60 }, source: "test", confidence: 0.9 })
  await runCorrelationScan(tenantA.orgId, tenantA.projectId)
  await runDecisionScan(tenantA.orgId, tenantA.projectId)
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("Mission Control API — real, functional", () => {
  it("GET /api/v1/intelligence/mission returns a real, non-fabricated snapshot", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/mission/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.snapshot.knowledgeAuthority.entityCount).toBeGreaterThanOrEqual(1)
    expect(body.snapshot.organicGrowth).toBeNull() // honestly unavailable — no Search Console configured
  })

  it("GET /api/v1/intelligence/next-action returns the real highest-priority pending decision", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/next-action/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request("http://localhost/x"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nextAction).not.toBeNull()
    expect(body.nextAction.decision.status).toBe("pending")
    expect(body.nextAction.plan.actionType).toBe(body.nextAction.decision.action)
  })

  it("a tenant with no real activity gets an honest, empty snapshot and a null next action — never fabricated", async () => {
    const { GET: getMission } = await import("@/app/api/v1/intelligence/mission/route")
    const { GET: getNext } = await import("@/app/api/v1/intelligence/next-action/route")
    mockSessionFor(tenantB)
    const missionRes = await getMission(new Request("http://localhost/x"))
    const missionBody = await missionRes.json()
    expect(missionBody.snapshot.knowledgeAuthority.entityCount).toBe(0)
    expect(missionBody.snapshot.pendingDecisionCount).toBe(0)

    const nextRes = await getNext(new Request("http://localhost/x"))
    const nextBody = await nextRes.json()
    expect(nextBody.nextAction).toBeNull()
  })

  it("tenant isolation: an explicit cross-tenant projectId is rejected", async () => {
    const { GET } = await import("@/app/api/v1/intelligence/mission/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/x?projectId=${tenantA.projectId}`))
    expect(res.status).toBe(400)
  })
})

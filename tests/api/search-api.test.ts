import { randomUUID } from "node:crypto"
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity } from "@/lib/knowledge/repo"

/* Real, tenant-scoped API coverage for GET /api/v1/search (Phase 8
 * §20-21, ADR risk R-47). Only the NextAuth session-verification step
 * is mocked; requireSession()'s real membership check still runs. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `search-${randomUUID()}@example.test`
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
let entityName: string

beforeAll(async () => {
  tenantA = await setupTenant()
  tenantB = await setupTenant()
  entityName = `Zylotrex Search Fixture ${randomUUID().slice(0, 8)}`
  await resolveOrCreateEntity(tenantA.orgId, tenantA.projectId, "Place", entityName)
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("GET /api/v1/search", () => {
  it("finds a real entity by a substring of its real name", async () => {
    const { GET } = await import("@/app/api/v1/search/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request(`http://localhost/x?q=${encodeURIComponent(entityName.slice(0, 12))}&projectId=${tenantA.projectId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results.some((r: { type: string; title: string }) => r.type === "entity" && r.title === entityName)).toBe(true)
  })

  it("returns nothing for a query under 2 characters — never a full-table scan", async () => {
    const { GET } = await import("@/app/api/v1/search/route")
    mockSessionFor(tenantA)
    const res = await GET(new Request(`http://localhost/x?q=a&projectId=${tenantA.projectId}`))
    const body = await res.json()
    expect(body.results).toHaveLength(0)
  })

  it("tenant isolation: tenant B's own session never sees tenant A's real entity, even by exact name", async () => {
    const { GET } = await import("@/app/api/v1/search/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/x?q=${encodeURIComponent(entityName)}&projectId=${tenantB.projectId}`))
    const body = await res.json()
    expect(body.results).toHaveLength(0)
  })

  it("a cross-tenant projectId degrades to org-only results rather than leaking or erroring", async () => {
    const { GET } = await import("@/app/api/v1/search/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/x?q=${encodeURIComponent(entityName)}&projectId=${tenantA.projectId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(0)
  })
})

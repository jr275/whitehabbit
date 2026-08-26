import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { workflowEngine } from "@/lib/workflow/engine"
import { requestApproval } from "@/lib/workflow/approval"
import { createDomain } from "@/lib/domains/repo"
import { resolveVerifiedDomain } from "@/lib/domains/repo"
import { createRouteTemplate } from "@/lib/route-templates/repo"

/* Phase 4 (§31 adversarial cases): every new Agent Control Center /
 * Domains / Approvals / RouteTemplates surface must be exactly as
 * tenant-isolated as the Phase 3 surface — 404, never 403, never a
 * silent cross-tenant leak. Only the NextAuth session-verification
 * step is mocked; requireSession()'s real membership check still runs
 * against the database for every request. */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

interface Tenant {
  orgId: string
  userId: string
  email: string
  projectId: string
}

async function setupTenant(): Promise<Tenant> {
  const email = `p4-${randomUUID()}@example.test`
  const { user, org } = await createUserWithOrganization(email, "hashed-password-not-real", `Org ${email}`)
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

describe("workflow control center API — cross-tenant isolation (§29, §31)", () => {
  it("GET /api/v1/workflows/:id never returns another tenant's run", async () => {
    const run = await workflowEngine.start({ orgId: tenantA.orgId, projectId: tenantA.projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })
    const { GET } = await import("@/app/api/v1/workflows/[id]/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/v1/workflows/${run.id}`), { params: Promise.resolve({ id: run.id }) })
    expect(res.status).toBe(404)

    mockSessionFor(tenantA)
    const ownRes = await GET(new Request(`http://localhost/api/v1/workflows/${run.id}`), { params: Promise.resolve({ id: run.id }) })
    expect(ownRes.status).toBe(200)
  })

  it("GET /api/v1/workflows (list) never includes another tenant's runs", async () => {
    const run = await workflowEngine.start({ orgId: tenantA.orgId, projectId: tenantA.projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })
    const { GET } = await import("@/app/api/v1/workflows/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request("http://localhost/api/v1/workflows"))
    const body = await res.json()
    expect(body.workflows.some((w: { id: string }) => w.id === run.id)).toBe(false)
  })

  it("POST /api/v1/workflows/:id/cancel and /pause never let another tenant act on the run, and never mutate it", async () => {
    const { POST: cancelPost } = await import("@/app/api/v1/workflows/[id]/cancel/route")
    const { POST: pausePost } = await import("@/app/api/v1/workflows/[id]/pause/route")
    for (const [action, handler] of [
      ["cancel", cancelPost],
      ["pause", pausePost],
    ] as const) {
      const run = await workflowEngine.start({ orgId: tenantA.orgId, projectId: tenantA.projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })
      mockSessionFor(tenantB)
      const res = await handler(new Request(`http://localhost/api/v1/workflows/${run.id}/${action}`, { method: "POST" }), { params: Promise.resolve({ id: run.id }) })
      expect(res.status).toBe(404)

      const real = await workflowEngine.getStatus(run.id, tenantA.orgId)
      expect(real?.status).toBe("running") // untouched by tenant B's attempt
    }
  })
})

describe("approvals API — cross-tenant isolation (§12, §31)", () => {
  it("a pending approval created under tenant A is never visible or decidable by tenant B", async () => {
    const run = await workflowEngine.start({ orgId: tenantA.orgId, projectId: tenantA.projectId, pipeline: "content_generation", subjectType: "opportunity", subjectId: `s-${randomUUID()}` })
    const approval = await requestApproval({
      orgId: tenantA.orgId,
      projectId: tenantA.projectId,
      workflowRunId: run.id,
      artifactType: "page",
      artifactId: `page-${randomUUID()}`,
      requestedByAgent: "ContentGenerationAgent",
      approvalType: "publish",
      riskLevel: "low",
    })

    const { GET: listApprovals } = await import("@/app/api/v1/approvals/route")
    mockSessionFor(tenantB)
    const listRes = await listApprovals(new Request("http://localhost/api/v1/approvals"))
    const listBody = await listRes.json()
    expect(listBody.approvals.some((a: { id: string }) => a.id === approval.id)).toBe(false)

    const { POST: approveRoute } = await import("@/app/api/v1/approvals/[id]/approve/route")
    const approveRes = await approveRoute(new Request(`http://localhost/api/v1/approvals/${approval.id}/approve`, { method: "POST" }), {
      params: Promise.resolve({ id: approval.id }),
    })
    expect(approveRes.status).toBe(404)

    // the run must still be waiting_approval — tenant B's attempt did nothing
    const real = await workflowEngine.getStatus(run.id, tenantA.orgId)
    expect(real?.status).toBe("waiting_approval")
  })
})

describe("domains API — cross-tenant isolation and never-trust-unverified (§15-17, §31)", () => {
  it("tenant B can never read or verify tenant A's domain", async () => {
    const domain = await createDomain({ orgId: tenantA.orgId, projectId: tenantA.projectId, hostname: `tenant-a-${randomUUID()}.example.test`, kind: "custom" })

    const { GET: listDomains } = await import("@/app/api/v1/domains/route")
    mockSessionFor(tenantB)
    const listRes = await listDomains(new Request(`http://localhost/api/v1/domains?projectId=${tenantA.projectId}`))
    expect(listRes.status).toBe(400) // "Project not found" for a project that isn't tenant B's — never a silent empty 200 that could be confused with "verified but no domains"

    const { POST: verifyRoute } = await import("@/app/api/v1/domains/[id]/verify/route")
    const verifyRes = await verifyRoute(new Request(`http://localhost/api/v1/domains/${domain.id}/verify`, { method: "POST" }), {
      params: Promise.resolve({ id: domain.id }),
    })
    expect(verifyRes.status).toBe(404)
  })

  it("resolveVerifiedDomain (the ONLY function public rendering may call) never returns a pending/unverified domain, no matter how plausible the hostname", async () => {
    const hostname = `pending-${randomUUID()}.example.test`
    await createDomain({ orgId: tenantA.orgId, projectId: tenantA.projectId, hostname, kind: "custom" })
    const resolved = await resolveVerifiedDomain(hostname)
    expect(resolved).toBeNull() // real DNS verification never ran — never assumed verified
  })

  it("registering the same hostname twice is rejected (a hostname belongs to exactly one tenant)", async () => {
    const hostname = `dup-${randomUUID()}.example.test`
    await createDomain({ orgId: tenantA.orgId, projectId: tenantA.projectId, hostname, kind: "custom" })
    const { POST: createRoute } = await import("@/app/api/v1/domains/route")
    mockSessionFor(tenantB) // even a *different* tenant can't claim an already-registered hostname
    const res = await createRoute(
      new Request("http://localhost/api/v1/domains", { method: "POST", body: JSON.stringify({ projectId: tenantB.projectId, hostname, kind: "custom" }) }),
    )
    expect(res.status).toBe(400)
  })
})

describe("route templates API — cross-tenant isolation (§19, §31)", () => {
  it("tenant B never sees tenant A's route templates", async () => {
    const template = await createRouteTemplate({ orgId: tenantA.orgId, projectId: tenantA.projectId, name: `tpl-${randomUUID()}`, pattern: "/{city}/{intent}" })
    const { GET } = await import("@/app/api/v1/route-templates/route")
    mockSessionFor(tenantB)
    const res = await GET(new Request(`http://localhost/api/v1/route-templates?projectId=${tenantA.projectId}`))
    expect(res.status).toBe(400) // tenantA's project is not visible to tenantB

    mockSessionFor(tenantA)
    const ownRes = await GET(new Request(`http://localhost/api/v1/route-templates?projectId=${tenantA.projectId}`))
    const ownBody = await ownRes.json()
    expect(ownBody.routeTemplates.some((t: { id: string }) => t.id === template.id)).toBe(true)
  })
})

describe("unauthenticated access — every new route rejects with 401, never a default/fallback org (§31)", () => {
  it("workflows/approvals/domains all require a real session", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any)
    const { GET: listWorkflows } = await import("@/app/api/v1/workflows/route")
    expect((await listWorkflows(new Request("http://localhost/api/v1/workflows"))).status).toBe(401)

    const { GET: listApprovals } = await import("@/app/api/v1/approvals/route")
    expect((await listApprovals(new Request("http://localhost/api/v1/approvals"))).status).toBe(401)

    const { POST: createDomainRoute } = await import("@/app/api/v1/domains/route")
    expect(
      (
        await createDomainRoute(new Request("http://localhost/api/v1/domains", { method: "POST", body: JSON.stringify({ projectId: "x", hostname: "x.example.test" }) }))
      ).status,
    ).toBe(401)
  })
})

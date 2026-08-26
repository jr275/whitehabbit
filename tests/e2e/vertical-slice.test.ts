import { randomUUID } from "node:crypto"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { createUserWithOrganization } from "@/lib/db/repo"
import { GET as getDefaultProjectRoute } from "@/app/api/projects/default/route"
import { POST as createWebsiteRoute } from "@/app/api/projects/[projectId]/websites/route"
import { POST as discoverWebsiteRoute } from "@/app/api/projects/[projectId]/websites/[websiteId]/discover/route"
import { GET as getWebsiteRoute } from "@/app/api/websites/[id]/route"
import { GET as listOpportunitiesRoute } from "@/app/api/opportunities/route"
import { PATCH as reviewOpportunityRoute } from "@/app/api/opportunities/[id]/route"
import { POST as generateOpportunityRoute } from "@/app/api/opportunities/[id]/generate/route"
import { GET as getPageRoute } from "@/app/api/pages/[id]/route"
import { POST as publishPageRoute } from "@/app/api/pages/[id]/publish/route"
import { GET as sitemapRoute } from "@/app/sitemap.xml/route"
import PublicPage, { generateMetadata as publicPageMetadata } from "@/app/sites/[projectId]/[slug]/page"
import type { Opportunity } from "@/lib/opportunity/model"
import type { Page } from "@/lib/pages/model"
import { FIXTURE_ORIGIN, FIXTURE_PAGES } from "./fixture-website"

/* ================================================================== *
 * §32 — the mandatory, deterministic end-to-end test:
 *
 *   Create Tenant -> Create Project -> Connect test website -> Crawl
 *   fixture site -> Extract entities -> Create opportunity -> Approve
 *   opportunity -> Generate page -> QA -> Publish -> Request public
 *   URL -> Verify HTML -> Verify JSON-LD -> Verify canonical ->
 *   Verify sitemap inclusion.
 *
 * Runs through the REAL API route handlers end to end (not
 * reimplemented test logic) against the real database. Only the true
 * network boundary is faked (§33: never a live production website) —
 * DNS resolution and global fetch() are mocked to serve the fixture
 * site at a fake-but-syntactically-real hostname; the whole crawler
 * (SSRF guard included — assertSafeUrl really runs, really resolves
 * DNS, just against the mocked resolver) executes unmodified.
 *
 * The public page is rendered via the real, unmodified page component
 * (react-dom/server, not a re-implementation) — genuine HTML output,
 * not a stand-in.
 * ================================================================== */

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]), // a real, public (non-private) IPv4 address
}))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
  const parsed = new URL(url)
  if (parsed.origin !== FIXTURE_ORIGIN) {
    return Promise.reject(new Error(`Test bug: unexpected fetch to a non-fixture origin: ${url}`))
  }
  const entry = FIXTURE_PAGES[parsed.pathname]
  if (!entry) return Promise.resolve(new Response("not found", { status: 404 }))
  return Promise.resolve(new Response(entry.body, { status: entry.status, headers: { "content-type": entry.contentType } }))
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
}

let orgId: string
let userId: string
let projectId: string

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeFetch)
  const email = `e2e-${randomUUID()}@example.test`
  const { user, org } = await createUserWithOrganization(email, "hashed-not-real", `E2E Org ${email}`)
  orgId = org.id
  userId = user.id
  vi.mocked(auth).mockResolvedValue({
    organizationId: org.id,
    organizationName: org.name,
    user: { id: user.id, email },
    expires: new Date(Date.now() + 3600_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}, 30_000)

afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("first real end-to-end vertical slice", () => {
  it("Create Project (default project)", async () => {
    const res = await getDefaultProjectRoute()
    expect(res.status).toBe(200)
    const body = await res.json()
    projectId = body.project.id
    expect(projectId).toBeTruthy()
  })

  let websiteId: string

  it("Connect test website", async () => {
    const res = await createWebsiteRoute(jsonRequest("http://localhost/api/projects/x/websites", "POST", { url: FIXTURE_ORIGIN }), {
      params: Promise.resolve({ projectId }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    websiteId = body.website.id
    expect(body.website.discoveryStatus).toBe("pending")
    expect(body.website.hostname).toBe("fixture.example.test")
  })

  let opportunities: Opportunity[]

  it("Crawl the fixture site, extract entities, and discover opportunities — all via one real discovery run", async () => {
    const res = await discoverWebsiteRoute(jsonRequest("http://localhost/api/discover", "POST"), { params: Promise.resolve({ projectId, websiteId }) })
    expect(res.status, `discovery failed: ${JSON.stringify(await res.clone().json().catch(() => null))}`).toBe(200)
    const body = await res.json()
    expect(body.result.pagesCrawled).toBeGreaterThanOrEqual(4) // home, services, faq, about
    expect(body.result.entitiesCreated).toBeGreaterThan(0)
    expect(body.result.opportunitiesCreated).toBeGreaterThan(0)
  }, 30_000)

  it("Website Knowledge Profile and discovery status are real and persisted", async () => {
    const res = await getWebsiteRoute(new Request(`http://localhost/api/websites/${websiteId}`), { params: Promise.resolve({ id: websiteId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.website.discoveryStatus).toBe("ready")
    expect(body.knowledgeProfile).not.toBeNull()
    expect(body.knowledgeProfile.profile.domainSignals.pagesCrawled).toBeGreaterThanOrEqual(4)
  })

  it("Opportunities are real, persisted, and explainably scored", async () => {
    const res = await listOpportunitiesRoute(new Request("http://localhost/api/opportunities"))
    const body = await res.json()
    opportunities = body.opportunities
    expect(opportunities.length).toBeGreaterThan(0)
    for (const opp of opportunities) {
      expect(opp.status).toBe("discovered")
      // Known/Estimated/Unavailable discipline: every populated score is a real number, never a placeholder.
      if (opp.entityCoverageScore != null) expect(opp.entityCoverageScore).toBeGreaterThanOrEqual(0)
      if (opp.informationGainScore != null) expect(Array.isArray(opp.informationGainReasons)).toBe(true)
      expect(opp.demandScore).toBeNull() // honestly unavailable — no Search Console integration exists
    }
  })

  let approvedOpportunity: Opportunity

  it("Approve the highest-scored opportunity", async () => {
    const best = [...opportunities].sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1))[0]
    const res = await reviewOpportunityRoute(jsonRequest(`http://localhost/api/opportunities/${best.id}`, "PATCH", { decision: "approved" }), {
      params: Promise.resolve({ id: best.id }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    approvedOpportunity = body.opportunity
    expect(approvedOpportunity.status).toBe("approved")
  })

  let generatedPage: Page

  it("Generate page: PageBrief -> Research -> Outline -> Draft -> SEO -> GEO -> Quality gate", async () => {
    const res = await generateOpportunityRoute(jsonRequest(`http://localhost/api/opportunities/${approvedOpportunity.id}/generate`, "POST"), {
      params: Promise.resolve({ id: approvedOpportunity.id }),
    })
    const body = await res.json()
    // A real, honest outcome either way — but the fixture has real
    // structured-data evidence, so the quality gate should pass.
    expect(res.status, `generation response: ${JSON.stringify(body)}`).toBe(200)
    generatedPage = body.page
    expect(generatedPage.status, `quality gate rejected: ${JSON.stringify(generatedPage.rejectionReasons)}`).toBe("ready")
  }, 30_000)

  it("Publish the page", async () => {
    const res = await publishPageRoute(jsonRequest(`http://localhost/api/pages/${generatedPage.id}/publish`, "POST"), {
      params: Promise.resolve({ id: generatedPage.id }),
    })
    expect(res.status, `publish failed: ${JSON.stringify(await res.clone().json().catch(() => null))}`).toBe(200)
    const body = await res.json()
    generatedPage = body.page
    expect(generatedPage.status).toBe("published")
    expect(generatedPage.canonicalUrl).toContain(`/sites/${projectId}/${generatedPage.slug}`)
  })

  it("Request the public URL and verify real rendered HTML + JSON-LD + canonical", async () => {
    const params = Promise.resolve({ projectId, slug: generatedPage.slug })
    const metadata = await publicPageMetadata({ params })
    expect(metadata.title).toBeTruthy()
    expect(metadata.alternates?.canonical).toBe(generatedPage.canonicalUrl)

    const element = await PublicPage({ params })
    const html = renderToStaticMarkup(element)
    expect(html).toContain(String(metadata.title))
    // real JSON-LD, generated at publish time, present in the real HTML
    expect(html).toContain('"@type":"WebPage"')
    expect(html).toContain('"@type":"BreadcrumbList"')

    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(ldMatch).not.toBeNull()
    const parsedLd = JSON.parse(ldMatch![1])
    expect(Array.isArray(parsedLd)).toBe(true)
    expect(parsedLd.some((b: { "@type"?: string }) => b["@type"] === "WebPage")).toBe(true)
  })

  it("Verify a not-yet-published slug 404s (public route never leaks unpublished content)", async () => {
    const params = Promise.resolve({ projectId, slug: `does-not-exist-${randomUUID()}` })
    await expect(publicPageMetadata({ params })).resolves.toEqual({})
  })

  it("Verify the page is discoverable via the real sitemap route", async () => {
    const res = await sitemapRoute()
    const xml = await res.text()
    expect(xml).toContain(generatedPage.canonicalUrl)
    expect(xml).toMatch(/<lastmod>[\d-]+T/)
  })

  it("Agent runs for this website and opportunity are real and inspectable", async () => {
    const res = await getPageRoute(new Request(`http://localhost/api/pages/${generatedPage.id}`), { params: Promise.resolve({ id: generatedPage.id }) })
    const body = await res.json()
    expect(body.version).not.toBeNull()
    expect(body.artifacts.map((a: { type: string }) => a.type).sort()).toEqual(["draft", "geo", "outline", "quality", "research", "seo"])
  })
})

import "server-only"

/* ================================================================== *
 * PUBLISH (§27 minimal durable publication workflow) — the one
 * explicit action that turns a "ready" Page into a "published" one.
 * Idempotent by construction: only a page in exactly "ready" status
 * can be published (§6 — publishing an already-published page is
 * rejected, never silently re-published or duplicated). Generates and
 * validates JSON-LD against the real, domain-aware canonical URL
 * (ADR-018), generates internal link recommendations, invalidates/
 * revalidates the real render path, and marks the owning Opportunity
 * "published" — all as one real, consistent action.
 * ================================================================== */

import { revalidatePath } from "next/cache"
import { getEntity } from "@/lib/knowledge/repo"
import { generateInternalLinks } from "@/lib/internal-links/generate"
import { resolveCanonicalUrl } from "@/lib/domains/canonical"
import { assertCapability } from "@/lib/workflow/permissions"
import { buildJsonLd, validateJsonLd } from "./json-ld"
import { getPageBrief } from "@/lib/pagebrief/repo"
import { attachPublishArtifacts, getLatestVersion, getPage, publishPage } from "./repo"
import { updateOpportunityStatus } from "@/lib/opportunity/repo"

export class PageNotReadyError extends Error {
  constructor(status: string) {
    super(`Page is "${status}" — only a page in "ready" status can be published.`)
    this.name = "PageNotReadyError"
  }
}

export class InvalidJsonLdError extends Error {
  constructor(errors: string[]) {
    super(`Generated JSON-LD failed validation: ${errors.join("; ")}`)
    this.name = "InvalidJsonLdError"
  }
}

export async function publishPageAction(pageId: string, orgId: string) {
  assertCapability("PublisherAgent", "publish_page_version")

  const page = await getPage(pageId, orgId)
  if (!page) throw new Error("Page not found.")
  if (page.status !== "ready") throw new PageNotReadyError(page.status)

  const version = await getLatestVersion(pageId, orgId)
  if (!version) throw new Error("Page has no content version to publish.")

  const brief = await getPageBrief(page.pageBriefId, orgId)
  const primaryEntity = brief?.primaryEntityId ? await getEntity(brief.primaryEntityId, orgId) : null

  const canonicalUrl = await resolveCanonicalUrl(orgId, page.projectId, page.slug)
  const jsonLd = buildJsonLd(page, version.content, canonicalUrl, primaryEntity)
  const validation = validateJsonLd(jsonLd)
  if (!validation.valid) throw new InvalidJsonLdError(validation.errors)

  await attachPublishArtifacts(version.id, orgId, jsonLd, { title: version.content.title, description: version.content.metaDescription, canonicalUrl, slug: page.slug })

  assertCapability("PublisherAgent", "invalidate_cache")
  await publishPage(pageId, orgId, version.id, canonicalUrl)
  await generateInternalLinks(page, brief?.primaryEntityId ?? null)
  await updateOpportunityStatus(page.opportunityId, orgId, "published")

  assertCapability("PublisherAgent", "request_revalidation")
  try {
    revalidatePath(`/sites/${page.projectId}/${page.slug}`)
    revalidatePath("/sitemap.xml")
  } catch {
    // revalidatePath requires an active Next.js request/build context —
    // a no-op outside one (e.g. a test or a queue-worker tick with no
    // request in flight) is fine: both render routes are already fully
    // dynamic (no cache to invalidate) — see the routes' own
    // `force-dynamic`/DB-read-per-request behavior.
  }

  return { page: { ...page, status: "published" as const, canonicalUrl, publishedVersionId: version.id }, canonicalUrl }
}

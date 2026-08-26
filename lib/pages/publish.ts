import "server-only"

/* ================================================================== *
 * PUBLISH (§55 minimal slice) — the one explicit, human-triggered
 * action that turns a "ready" Page into a "published" one. Never
 * automatic (ADR-003's default autonomy level; §25). Generates and
 * validates JSON-LD, generates internal link recommendations, and
 * marks the owning Opportunity "published" — all as one real,
 * consistent action.
 * ================================================================== */

import { getEntity } from "@/lib/knowledge/repo"
import { generateInternalLinks } from "@/lib/internal-links/generate"
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

export async function publishPageAction(pageId: string, orgId: string, baseUrl: string) {
  const page = await getPage(pageId, orgId)
  if (!page) throw new Error("Page not found.")
  if (page.status !== "ready") throw new PageNotReadyError(page.status)

  const version = await getLatestVersion(pageId, orgId)
  if (!version) throw new Error("Page has no content version to publish.")

  const brief = await getPageBrief(page.pageBriefId, orgId)
  const primaryEntity = brief?.primaryEntityId ? await getEntity(brief.primaryEntityId, orgId) : null

  const canonicalUrl = `${baseUrl.replace(/\/$/, "")}/sites/${page.projectId}/${page.slug}`
  const jsonLd = buildJsonLd(page, version.content, canonicalUrl, primaryEntity)
  const validation = validateJsonLd(jsonLd)
  if (!validation.valid) throw new InvalidJsonLdError(validation.errors)

  await attachPublishArtifacts(version.id, orgId, jsonLd, { title: version.content.title, description: version.content.metaDescription, canonicalUrl, slug: page.slug })
  await publishPage(pageId, orgId, version.id, canonicalUrl)
  await generateInternalLinks(page, brief?.primaryEntityId ?? null)
  await updateOpportunityStatus(page.opportunityId, orgId, "published")

  return { page: { ...page, status: "published" as const, canonicalUrl, publishedVersionId: version.id }, canonicalUrl }
}

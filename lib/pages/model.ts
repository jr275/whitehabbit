/* ================================================================== *
 * PAGES — domain types (§21-22). See docs/adr/ADR-016 for why public
 * rendering resolves a Page by (projectId, slug) rather than a
 * generalized RouteTemplate in this revision.
 * ================================================================== */

export type PageStatus = "draft" | "quality_rejected" | "ready" | "published"

export interface Page {
  id: string
  orgId: string
  projectId: string
  opportunityId: string
  pageBriefId: string
  pageTemplateId: string | null
  slug: string
  status: PageStatus
  title: string | null
  metaDescription: string | null
  canonicalUrl: string | null
  qualityScore: number | null
  seoScore: number | null
  aeoScore: number | null
  geoScore: number | null
  informationGainScore: number | null
  rejectionReasons: string[] | null
  publishedVersionId: string | null
  createdAt: number
  updatedAt: number
}

export interface PageContentSection {
  heading: string
  body: string
}

export interface PageContent {
  title: string
  metaDescription: string
  sections: PageContentSection[]
}

export interface PageVersion {
  id: string
  orgId: string
  pageId: string
  version: number
  content: PageContent
  structuredContent: Record<string, unknown> | null
  schema: unknown[] | null
  seoMetadata: Record<string, unknown> | null
  createdBy: string | null
  agentRunId: string | null
  qualityStatus: PageStatus
  createdAt: number
}

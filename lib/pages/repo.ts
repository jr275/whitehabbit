import "server-only"

/* ================================================================== *
 * PAGES — repository. Org/project-scoped. Published pages reference an
 * immutable PageVersion (§22) — publishing never mutates historical
 * content, it only points published_version_id at a new, already-
 * created version.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { Page, PageContent, PageStatus, PageVersion } from "./model"

interface PageSqlRow {
  id: string
  org_id: string
  project_id: string
  opportunity_id: string
  page_brief_id: string
  page_template_id: string | null
  slug: string
  status: PageStatus
  title: string | null
  meta_description: string | null
  canonical_url: string | null
  quality_score: number | null
  seo_score: number | null
  aeo_score: number | null
  geo_score: number | null
  information_gain_score: number | null
  rejection_reasons: string[] | null
  published_version_id: string | null
  created_at: string
  updated_at: string
}

function rowToPage(r: PageSqlRow): Page {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    opportunityId: r.opportunity_id,
    pageBriefId: r.page_brief_id,
    pageTemplateId: r.page_template_id,
    slug: r.slug,
    status: r.status,
    title: r.title,
    metaDescription: r.meta_description,
    canonicalUrl: r.canonical_url,
    qualityScore: r.quality_score,
    seoScore: r.seo_score,
    aeoScore: r.aeo_score,
    geoScore: r.geo_score,
    informationGainScore: r.information_gain_score,
    rejectionReasons: r.rejection_reasons,
    publishedVersionId: r.published_version_id,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/-+$/, "") || "page"
}

/** Real uniqueness within a project — appends a short numeric suffix
 * on collision rather than failing or silently overwriting. */
export async function generateUniqueSlug(projectId: string, title: string): Promise<string> {
  const base = slugify(title)
  let candidate = base
  let attempt = 1
  for (;;) {
    const existing = await queryOne("SELECT 1 FROM pages WHERE project_id = $1 AND slug = $2", [projectId, candidate])
    if (!existing) return candidate
    attempt += 1
    candidate = `${base}-${attempt}`
  }
}

export async function createPage(input: {
  orgId: string
  projectId: string
  opportunityId: string
  pageBriefId: string
  slug: string
  title: string
  metaDescription: string | null
}): Promise<Page> {
  const id = `page_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO pages (id, org_id, project_id, opportunity_id, page_brief_id, slug, status, title, meta_description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $9)`,
    [id, input.orgId, input.projectId, input.opportunityId, input.pageBriefId, input.slug, input.title, input.metaDescription, now],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    opportunityId: input.opportunityId,
    pageBriefId: input.pageBriefId,
    pageTemplateId: null,
    slug: input.slug,
    status: "draft",
    title: input.title,
    metaDescription: input.metaDescription,
    canonicalUrl: null,
    qualityScore: null,
    seoScore: null,
    aeoScore: null,
    geoScore: null,
    informationGainScore: null,
    rejectionReasons: null,
    publishedVersionId: null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updatePageScores(
  id: string,
  patch: { status: PageStatus; qualityScore: number | null; seoScore: number | null; aeoScore: number | null; geoScore: number | null; informationGainScore: number | null; rejectionReasons: string[] | null },
): Promise<void> {
  await query(
    `UPDATE pages SET status = $1, quality_score = $2, seo_score = $3, aeo_score = $4, geo_score = $5, information_gain_score = $6, rejection_reasons = $7, updated_at = $8 WHERE id = $9`,
    [patch.status, patch.qualityScore, patch.seoScore, patch.aeoScore, patch.geoScore, patch.informationGainScore, patch.rejectionReasons ? JSON.stringify(patch.rejectionReasons) : null, Date.now(), id],
  )
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the page doesn't belong to orgId. */
export async function getPage(id: string, orgId: string): Promise<Page | null> {
  const row = await queryOne<PageSqlRow>("SELECT * FROM pages WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToPage(row) : null
}

export async function listPages(orgId: string, projectId: string, opts: { status?: PageStatus } = {}): Promise<Page[]> {
  if (opts.status) {
    const rows = await query<PageSqlRow>("SELECT * FROM pages WHERE org_id = $1 AND project_id = $2 AND status = $3 ORDER BY created_at DESC", [
      orgId,
      projectId,
      opts.status,
    ])
    return rows.map(rowToPage)
  }
  const rows = await query<PageSqlRow>("SELECT * FROM pages WHERE org_id = $1 AND project_id = $2 ORDER BY created_at DESC", [orgId, projectId])
  return rows.map(rowToPage)
}

/** Whether an existing page already targets this entity as its
 * primary subject — the real "does an equivalent page already exist"
 * signal lib/opportunity/information-gain.ts needs, and the real
 * cannibalization-avoidance check the discovery pipeline uses before
 * generating a duplicate entity_coverage_gap opportunity. */
export async function hasPageForEntity(projectId: string, entityId: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1 FROM pages p JOIN page_briefs b ON b.id = p.page_brief_id WHERE p.project_id = $1 AND b.primary_entity_id = $2`,
    [projectId, entityId],
  )
  return row !== null
}

/** The real, ready-or-published page (if any) whose brief targets this
 * entity as its primary subject — used by lib/internal-links/generate.ts
 * to only ever link to a page that actually exists and is presentable. */
export async function getPageForEntity(projectId: string, entityId: string, orgId: string): Promise<Page | null> {
  const row = await queryOne<PageSqlRow>(
    `SELECT p.* FROM pages p JOIN page_briefs b ON b.id = p.page_brief_id
     WHERE p.project_id = $1 AND b.primary_entity_id = $2 AND p.org_id = $3 AND p.status IN ('ready','published')
     ORDER BY p.created_at DESC LIMIT 1`,
    [projectId, entityId, orgId],
  )
  return row ? rowToPage(row) : null
}

export async function getPageByOpportunity(opportunityId: string, orgId: string): Promise<Page | null> {
  const row = await queryOne<PageSqlRow>("SELECT * FROM pages WHERE opportunity_id = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT 1", [
    opportunityId,
    orgId,
  ])
  return row ? rowToPage(row) : null
}

/* ---- page versions ------------------------------------------------- */

interface PageVersionSqlRow {
  id: string
  org_id: string
  page_id: string
  version: number
  content: PageContent
  structured_content: Record<string, unknown> | null
  schema: unknown[] | null
  seo_metadata: Record<string, unknown> | null
  created_by: string | null
  agent_run_id: string | null
  quality_status: PageStatus
  created_at: string
}

function rowToVersion(r: PageVersionSqlRow): PageVersion {
  return {
    id: r.id,
    orgId: r.org_id,
    pageId: r.page_id,
    version: r.version,
    content: r.content,
    structuredContent: r.structured_content,
    schema: r.schema,
    seoMetadata: r.seo_metadata,
    createdBy: r.created_by,
    agentRunId: r.agent_run_id,
    qualityStatus: r.quality_status,
    createdAt: Number(r.created_at),
  }
}

export async function createPageVersion(input: {
  orgId: string
  pageId: string
  content: PageContent
  structuredContent: Record<string, unknown> | null
  agentRunId: string | null
  qualityStatus: PageStatus
}): Promise<PageVersion> {
  const latest = await queryOne<{ version: number }>("SELECT version FROM page_versions WHERE page_id = $1 ORDER BY version DESC LIMIT 1", [input.pageId])
  const version = (latest?.version ?? 0) + 1
  const id = `pv_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO page_versions (id, org_id, page_id, version, content, structured_content, schema, seo_metadata, created_by, agent_run_id, quality_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, $7, $8, $9)`,
    [id, input.orgId, input.pageId, version, JSON.stringify(input.content), input.structuredContent ? JSON.stringify(input.structuredContent) : null, input.agentRunId, input.qualityStatus, now],
  )
  return {
    id,
    orgId: input.orgId,
    pageId: input.pageId,
    version,
    content: input.content,
    structuredContent: input.structuredContent,
    schema: null,
    seoMetadata: null,
    createdBy: null,
    agentRunId: input.agentRunId,
    qualityStatus: input.qualityStatus,
    createdAt: now,
  }
}

export async function attachPublishArtifacts(versionId: string, orgId: string, schema: unknown[], seoMetadata: Record<string, unknown>): Promise<void> {
  await query("UPDATE page_versions SET schema = $1, seo_metadata = $2 WHERE id = $3 AND org_id = $4", [JSON.stringify(schema), JSON.stringify(seoMetadata), versionId, orgId])
}

export async function publishPage(pageId: string, orgId: string, versionId: string, canonicalUrl: string): Promise<void> {
  const now = Date.now()
  await query("UPDATE page_versions SET quality_status = 'published' WHERE id = $1 AND org_id = $2", [versionId, orgId])
  await query("UPDATE pages SET status = 'published', published_version_id = $1, canonical_url = $2, updated_at = $3 WHERE id = $4 AND org_id = $5", [
    versionId,
    canonicalUrl,
    now,
    pageId,
    orgId,
  ])
}

export async function getLatestVersion(pageId: string, orgId: string): Promise<PageVersion | null> {
  const row = await queryOne<PageVersionSqlRow>("SELECT * FROM page_versions WHERE page_id = $1 AND org_id = $2 ORDER BY version DESC LIMIT 1", [
    pageId,
    orgId,
  ])
  return row ? rowToVersion(row) : null
}

export async function listVersions(pageId: string, orgId: string): Promise<PageVersion[]> {
  const rows = await query<PageVersionSqlRow>("SELECT * FROM page_versions WHERE page_id = $1 AND org_id = $2 ORDER BY version DESC", [pageId, orgId])
  return rows.map(rowToVersion)
}

/* ---- public resolution (§23, ADR-016) -------------------------------
 * The ONE function the public render route calls. No auth, no org
 * context — a published page is, by definition, meant to be public.
 * Isolated here so a future RouteTemplate engine replaces only this
 * function's internals, never the render route itself. */
export async function resolvePublishedPage(projectId: string, slug: string): Promise<{ page: Page; version: PageVersion } | null> {
  const pageRow = await queryOne<PageSqlRow>("SELECT * FROM pages WHERE project_id = $1 AND slug = $2 AND status = 'published'", [projectId, slug])
  if (!pageRow) return null
  const page = rowToPage(pageRow)
  if (!page.publishedVersionId) return null
  const versionRow = await queryOne<PageVersionSqlRow>("SELECT * FROM page_versions WHERE id = $1", [page.publishedVersionId])
  if (!versionRow) return null
  return { page, version: rowToVersion(versionRow) }
}

export async function listPublishedPages(): Promise<{ page: Page; version: PageVersion }[]> {
  const rows = await query<PageSqlRow>("SELECT * FROM pages WHERE status = 'published' AND published_version_id IS NOT NULL ORDER BY updated_at DESC LIMIT 5000")
  const results: { page: Page; version: PageVersion }[] = []
  for (const row of rows) {
    const page = rowToPage(row)
    const versionRow = await queryOne<PageVersionSqlRow>("SELECT * FROM page_versions WHERE id = $1", [page.publishedVersionId])
    if (versionRow) results.push({ page, version: rowToVersion(versionRow) })
  }
  return results
}

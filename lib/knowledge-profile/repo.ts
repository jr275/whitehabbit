import "server-only"

/* ================================================================== *
 * WEBSITE KNOWLEDGE PROFILE — repository. Versioned (§5): a re-run of
 * discovery creates a new version rather than mutating the old one, so
 * history of "what did we understand about this site, and when" is
 * never lost.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { WebsiteKnowledgeProfile, WebsiteKnowledgeProfileConfidence, WebsiteKnowledgeProfileFields } from "./model"

interface ProfileSqlRow {
  id: string
  org_id: string
  project_id: string
  website_id: string
  version: number
  source_crawl_id: string
  profile: WebsiteKnowledgeProfileFields
  confidence: WebsiteKnowledgeProfileConfidence
  created_at: string
}

function rowToProfile(r: ProfileSqlRow): WebsiteKnowledgeProfile {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    websiteId: r.website_id,
    version: r.version,
    sourceCrawlId: r.source_crawl_id,
    profile: r.profile,
    confidence: r.confidence,
    createdAt: Number(r.created_at),
  }
}

export async function createKnowledgeProfile(input: {
  orgId: string
  projectId: string
  websiteId: string
  sourceCrawlId: string
  profile: WebsiteKnowledgeProfileFields
  confidence: WebsiteKnowledgeProfileConfidence
}): Promise<WebsiteKnowledgeProfile> {
  const latest = await queryOne<{ version: number }>("SELECT version FROM website_knowledge_profiles WHERE website_id = $1 ORDER BY version DESC LIMIT 1", [
    input.websiteId,
  ])
  const version = (latest?.version ?? 0) + 1
  const id = `wkp_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO website_knowledge_profiles (id, org_id, project_id, website_id, version, source_crawl_id, profile, confidence, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, input.orgId, input.projectId, input.websiteId, version, input.sourceCrawlId, JSON.stringify(input.profile), JSON.stringify(input.confidence), now],
  )
  return { id, orgId: input.orgId, projectId: input.projectId, websiteId: input.websiteId, version, sourceCrawlId: input.sourceCrawlId, profile: input.profile, confidence: input.confidence, createdAt: now }
}

export async function getLatestKnowledgeProfile(websiteId: string, orgId: string): Promise<WebsiteKnowledgeProfile | null> {
  const row = await queryOne<ProfileSqlRow>(
    "SELECT * FROM website_knowledge_profiles WHERE website_id = $1 AND org_id = $2 ORDER BY version DESC LIMIT 1",
    [websiteId, orgId],
  )
  return row ? rowToProfile(row) : null
}

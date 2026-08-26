import "server-only"

/* ================================================================== *
 * CONTENT ARTIFACTS — repository (§15). Every pipeline step's real
 * output, versioned, tied to the agent_run that produced it.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"

export type ContentArtifactType = "research" | "outline" | "draft" | "seo" | "geo" | "quality"

export interface ContentArtifactRecord {
  id: string
  orgId: string
  projectId: string
  pageBriefId: string
  agentRunId: string
  type: ContentArtifactType
  version: number
  content: unknown
  createdAt: number
}

interface ArtifactSqlRow {
  id: string
  org_id: string
  project_id: string
  page_brief_id: string
  agent_run_id: string
  type: ContentArtifactType
  version: number
  content: unknown
  created_at: string
}

function rowToArtifact(r: ArtifactSqlRow): ContentArtifactRecord {
  return { id: r.id, orgId: r.org_id, projectId: r.project_id, pageBriefId: r.page_brief_id, agentRunId: r.agent_run_id, type: r.type, version: r.version, content: r.content, createdAt: Number(r.created_at) }
}

export async function createContentArtifact(input: {
  orgId: string
  projectId: string
  pageBriefId: string
  agentRunId: string
  type: ContentArtifactType
  content: unknown
}): Promise<ContentArtifactRecord> {
  const id = `artifact_${randomUUID()}`
  const now = Date.now()
  await query(
    "INSERT INTO content_artifacts (id, org_id, project_id, page_brief_id, agent_run_id, type, version, content, created_at) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)",
    [id, input.orgId, input.projectId, input.pageBriefId, input.agentRunId, input.type, JSON.stringify(input.content), now],
  )
  return { id, orgId: input.orgId, projectId: input.projectId, pageBriefId: input.pageBriefId, agentRunId: input.agentRunId, type: input.type, version: 1, content: input.content, createdAt: now }
}

export async function listArtifactsForBrief(pageBriefId: string, orgId: string): Promise<ContentArtifactRecord[]> {
  const rows = await query<ArtifactSqlRow>("SELECT * FROM content_artifacts WHERE page_brief_id = $1 AND org_id = $2 ORDER BY created_at ASC", [
    pageBriefId,
    orgId,
  ])
  return rows.map(rowToArtifact)
}

/** The real, DB-driven rehydration a step-level job needs (Phase 5A):
 * a step dispatched as its own job/process can never rely on an earlier
 * step's in-memory closure — it re-fetches that step's full persisted
 * artifact by (agentRunId, type) instead. Scoped to THIS run, never a
 * stale artifact from an earlier terminated run for the same brief. */
export async function getArtifact<T = unknown>(orgId: string, agentRunId: string, type: ContentArtifactType): Promise<T | null> {
  const rows = await query<ArtifactSqlRow>(
    "SELECT * FROM content_artifacts WHERE org_id = $1 AND agent_run_id = $2 AND type = $3 ORDER BY created_at DESC LIMIT 1",
    [orgId, agentRunId, type],
  )
  return rows.length ? (rowToArtifact(rows[0]).content as T) : null
}

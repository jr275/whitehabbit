import "server-only"

/* ================================================================== *
 * PROJECTS — one connected website/workspace per tenant (§8: "do not
 * assume one tenant = one website"). See ARCHITECTURE.md §1,
 * docs/adr/ADR-001, docs/architecture/domain-model.md.
 *
 * Real, org-scoped rows only — every function here takes an explicit
 * orgId and filters on it, matching every other function in
 * lib/db/repo.ts. No feature yet lets a tenant create/name additional
 * Projects through the UI (docs/architecture/risks.md R-12); until
 * that onboarding exists, getOrCreateDefaultProject() lazily creates
 * exactly one real "Default Project" row per org, so the Knowledge
 * Graph and Opportunity Engine have a real project_id to scope to
 * without forcing every existing caller to pass one that doesn't
 * exist yet.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "@/lib/db/client"

export interface ProjectRow {
  id: string
  orgId: string
  name: string
  primaryDomain: string | null
  createdAt: number
  createdBy: string | null
}

interface ProjectSqlRow {
  id: string
  org_id: string
  name: string
  primary_domain: string | null
  created_at: string
  created_by: string | null
}

function rowToProject(r: ProjectSqlRow): ProjectRow {
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    primaryDomain: r.primary_domain,
    createdAt: Number(r.created_at),
    createdBy: r.created_by,
  }
}

export async function listProjects(orgId: string): Promise<ProjectRow[]> {
  const rows = await query<ProjectSqlRow>("SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at ASC", [orgId])
  return rows.map(rowToProject)
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the project doesn't belong to orgId. */
export async function getProject(id: string, orgId: string): Promise<ProjectRow | null> {
  const row = await queryOne<ProjectSqlRow>("SELECT * FROM projects WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToProject(row) : null
}

export async function createProject(orgId: string, name: string, opts: { primaryDomain?: string; createdBy?: string } = {}): Promise<ProjectRow> {
  const id = `proj_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO projects (id, org_id, name, primary_domain, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6)", [
    id,
    orgId,
    name,
    opts.primaryDomain ?? null,
    now,
    opts.createdBy ?? null,
  ])
  return { id, orgId, name, primaryDomain: opts.primaryDomain ?? null, createdAt: now, createdBy: opts.createdBy ?? null }
}

/** The one Project every org has today, created on first use. Race-safe:
 * the SELECT-then-INSERT runs inside a transaction with a row-level
 * advisory lock scoped to this org's id so two concurrent callers can
 * never create two "Default Project" rows for the same org. */
export async function getOrCreateDefaultProject(orgId: string): Promise<ProjectRow> {
  const existing = await queryOne<ProjectSqlRow>("SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at ASC LIMIT 1", [orgId])
  if (existing) return rowToProject(existing)

  return withTransaction(async (client) => {
    // hashtext() is deterministic per orgId string — safe advisory-lock key.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [orgId])
    const { rows } = await client.query<ProjectSqlRow>("SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at ASC LIMIT 1", [orgId])
    if (rows[0]) return rowToProject(rows[0])

    const id = `proj_${randomUUID()}`
    const now = Date.now()
    await client.query("INSERT INTO projects (id, org_id, name, primary_domain, created_at, created_by) VALUES ($1, $2, $3, NULL, $4, NULL)", [
      id,
      orgId,
      "Default Project",
      now,
    ])
    return { id, orgId, name: "Default Project", primaryDomain: null, createdAt: now, createdBy: null }
  })
}

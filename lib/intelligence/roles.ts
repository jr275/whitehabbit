import "server-only"

/* ================================================================== *
 * ROLE (§18) — operational intelligence per audience role, working
 * identically across verticals (a real-estate "Investor" role and a
 * SaaS "IT Buyer" role are the same shape — free-text fields, no
 * vertical-specific columns).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export interface Role {
  id: string
  orgId: string
  projectId: string
  name: string
  questions: string[]
  painPoints: string[]
  kpis: string[]
  decisionCriteria: string[]
  preferredTerminology: string[]
  createdAt: number
  updatedAt: number
}

interface RoleRow {
  id: string
  org_id: string
  project_id: string
  name: string
  questions: string[]
  pain_points: string[]
  kpis: string[]
  decision_criteria: string[]
  preferred_terminology: string[]
  created_at: string
  updated_at: string
}

function rowToRole(r: RoleRow): Role {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    name: r.name,
    questions: r.questions ?? [],
    painPoints: r.pain_points ?? [],
    kpis: r.kpis ?? [],
    decisionCriteria: r.decision_criteria ?? [],
    preferredTerminology: r.preferred_terminology ?? [],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export async function createRole(input: {
  orgId: string
  projectId: string
  name: string
  questions?: string[]
  painPoints?: string[]
  kpis?: string[]
  decisionCriteria?: string[]
  preferredTerminology?: string[]
}): Promise<Role> {
  const id = `role_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO roles (id, org_id, project_id, name, questions, pain_points, kpis, decision_criteria, preferred_terminology, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      JSON.stringify(input.questions ?? []),
      JSON.stringify(input.painPoints ?? []),
      JSON.stringify(input.kpis ?? []),
      JSON.stringify(input.decisionCriteria ?? []),
      JSON.stringify(input.preferredTerminology ?? []),
      now,
    ],
  )
  return (await getRole(id, input.orgId))!
}

export async function getRole(id: string, orgId: string): Promise<Role | null> {
  const row = await queryOne<RoleRow>("SELECT * FROM roles WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToRole(row) : null
}

export async function listRoles(orgId: string, projectId: string): Promise<Role[]> {
  const rows = await query<RoleRow>("SELECT * FROM roles WHERE org_id = $1 AND project_id = $2 ORDER BY name ASC", [orgId, projectId])
  return rows.map(rowToRole)
}

import "server-only"

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { RouteTemplate, RouteTemplateBinding, RouteTemplateStatus } from "./model"

interface RouteTemplateSqlRow {
  id: string
  org_id: string
  project_id: string
  name: string
  pattern: string
  version: number
  status: RouteTemplateStatus
  entity_bindings: RouteTemplateBinding[]
  intent_bindings: string[]
  market_bindings: string[]
  requirements: string[]
  priority: number
  created_at: string
  updated_at: string
}

function rowToTemplate(r: RouteTemplateSqlRow): RouteTemplate {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    name: r.name,
    pattern: r.pattern,
    version: r.version,
    status: r.status,
    entityBindings: r.entity_bindings ?? [],
    intentBindings: r.intent_bindings ?? [],
    marketBindings: r.market_bindings ?? [],
    requirements: r.requirements ?? [],
    priority: r.priority,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export async function createRouteTemplate(input: {
  orgId: string
  projectId: string
  name: string
  pattern: string
  entityBindings?: RouteTemplateBinding[]
  intentBindings?: string[]
  marketBindings?: string[]
  requirements?: string[]
  priority?: number
}): Promise<RouteTemplate> {
  const id = `rtpl_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO route_templates (id, org_id, project_id, name, pattern, version, status, entity_bindings, intent_bindings, market_bindings, requirements, priority, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, 'draft', $6, $7, $8, $9, $10, $11, $11)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      input.pattern,
      JSON.stringify(input.entityBindings ?? []),
      JSON.stringify(input.intentBindings ?? []),
      JSON.stringify(input.marketBindings ?? []),
      JSON.stringify(input.requirements ?? []),
      input.priority ?? 0,
      now,
    ],
  )
  const row = await queryOne<RouteTemplateSqlRow>("SELECT * FROM route_templates WHERE id = $1", [id])
  return rowToTemplate(row!)
}

export async function getRouteTemplate(id: string, orgId: string): Promise<RouteTemplate | null> {
  const row = await queryOne<RouteTemplateSqlRow>("SELECT * FROM route_templates WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToTemplate(row) : null
}

export async function listRouteTemplates(orgId: string, projectId: string): Promise<RouteTemplate[]> {
  const rows = await query<RouteTemplateSqlRow>(
    "SELECT * FROM route_templates WHERE org_id = $1 AND project_id = $2 ORDER BY priority DESC, created_at ASC",
    [orgId, projectId],
  )
  return rows.map(rowToTemplate)
}

/** Active templates only — the real candidate set page generation may
 * bind against (§19). A draft/archived template is never used to
 * classify a new page. */
export async function listActiveRouteTemplates(orgId: string, projectId: string): Promise<RouteTemplate[]> {
  const rows = await query<RouteTemplateSqlRow>(
    "SELECT * FROM route_templates WHERE org_id = $1 AND project_id = $2 AND status = 'active' ORDER BY priority DESC, created_at ASC",
    [orgId, projectId],
  )
  return rows.map(rowToTemplate)
}

export async function setRouteTemplateStatus(id: string, orgId: string, status: RouteTemplateStatus): Promise<void> {
  await query("UPDATE route_templates SET status = $1, updated_at = $2 WHERE id = $3 AND org_id = $4", [status, Date.now(), id, orgId])
}

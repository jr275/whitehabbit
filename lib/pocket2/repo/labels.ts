import "server-only"

/* Collections and tags. Same rule as items.ts: every function takes
 * orgId first and every statement filters on it — there is no
 * unscoped read. */

import { query } from "@/lib/db/client"
import type { Collection, Tag } from "@/lib/pocket2/domain/types"

export async function listCollections(orgId: string): Promise<Collection[]> {
  const rows = await query<{
    id: string; org_id: string; created_by: string | null; name: string; slug: string
    description: string | null; color: string | null; icon: string | null
    item_count: number; position: number; created_at: string; updated_at: string
  }>(
    `SELECT id, org_id, created_by, name, slug, description, color, icon,
            item_count, position, created_at, updated_at
       FROM collections WHERE org_id = $1 ORDER BY position ASC, name ASC`,
    [orgId],
  )
  return rows.map((r) => ({
    id: r.id, orgId: r.org_id, createdBy: r.created_by, name: r.name, slug: r.slug,
    description: r.description, color: r.color, icon: r.icon,
    itemCount: r.item_count, position: r.position,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }))
}

/** Ordered by real usage, so the sidebar surfaces the tags this
 * library actually leans on rather than alphabetical trivia. */
export async function listTags(orgId: string, limit = 50): Promise<Tag[]> {
  const rows = await query<{
    id: string; org_id: string; name: string; slug: string
    color: string | null; usage_count: number; created_at: string
  }>(
    `SELECT id, org_id, name, slug, color, usage_count, created_at
       FROM tags WHERE org_id = $1 ORDER BY usage_count DESC, name ASC LIMIT $2`,
    [orgId, limit],
  )
  return rows.map((r) => ({
    id: r.id, orgId: r.org_id, name: r.name, slug: r.slug,
    color: r.color, usageCount: r.usage_count, createdAt: Number(r.created_at),
  }))
}

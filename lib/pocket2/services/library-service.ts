import "server-only"

/* ================================================================== *
 * LIBRARY SERVICE — business logic between the route/page layer and
 * the repository.
 *
 * Every function takes a TenantContext explicitly. That is the whole
 * point of the type: a service function cannot be called without a
 * proven organization, so there is no code path where tenant scope is
 * "forgotten" rather than deliberately provided.
 * ================================================================== */

import type { TenantContext } from "@/lib/pocket2/domain/authz"
import { getItem, getLibraryFacets, listItems } from "@/lib/pocket2/repo/items"
import { listCollections, listTags } from "@/lib/pocket2/repo/labels"
import { withTenant } from "@/lib/pocket2/repo/tenant-db"
import type { LibraryQuery, Page, SavedItemView } from "@/lib/pocket2/domain/types"

export interface ShellData {
  counts: { total: number; unread: number; favorites: number; archived: number }
  labels: {
    collections: { name: string; slug: string }[]
    tags: { name: string; slug: string }[]
  }
}

/** Everything the persistent shell needs, in one parallel round trip.
 * Resolved once per page render and passed down as props, so the
 * sidebar never triggers its own fetch on every navigation. */
export async function getShellData(ctx: TenantContext): Promise<ShellData> {
  /* One tenant scope for all three reads: they share a transaction, so
   * this is one connection and one declared organization rather than
   * three.
   *
   * Sequential rather than Promise.all, deliberately. They share a
   * single connection, so there is no parallelism to win — and issuing
   * overlapping queries on one pg client relies on internal queuing
   * that pg deprecates and will remove in v9. */
  const facets = await withTenant(ctx.orgId, () => getLibraryFacets(ctx.orgId, ctx.userId))
  const collections = await withTenant(ctx.orgId, () => listCollections(ctx.orgId))
  const tags = await withTenant(ctx.orgId, () => listTags(ctx.orgId, 12))

  return {
    counts: {
      total: facets.total,
      unread: facets.unread,
      favorites: facets.favorites,
      archived: facets.archived,
    },
    labels: {
      collections: collections.map((c) => ({ name: c.name, slug: c.slug })),
      tags: tags.map((t) => ({ name: t.name, slug: t.slug })),
    },
  }
}

export async function getLibraryPage(ctx: TenantContext, q: LibraryQuery): Promise<Page<SavedItemView>> {
  return withTenant(ctx.orgId, () => listItems(ctx.orgId, ctx.userId, q))
}

/** One item, or null when it is not in the caller's organization —
 * which the route reports as 404, identically to one that does not
 * exist. Routes go through here rather than calling the repository
 * directly, so the tenant scope can never be forgotten at the edge. */
export async function getSavedItem(ctx: TenantContext, itemId: string): Promise<SavedItemView | null> {
  return withTenant(ctx.orgId, () => getItem(ctx.orgId, ctx.userId, itemId))
}

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
import { getLibraryFacets, listItems } from "@/lib/pocket2/repo/items"
import { listCollections, listTags } from "@/lib/pocket2/repo/labels"
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
  const [facets, collections, tags] = await Promise.all([
    getLibraryFacets(ctx.orgId, ctx.userId),
    listCollections(ctx.orgId),
    listTags(ctx.orgId, 12),
  ])

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
  return listItems(ctx.orgId, ctx.userId, q)
}

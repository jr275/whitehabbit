import "server-only"

/* ================================================================== *
 * SAVE SERVICE — the business logic behind "paste a URL".
 *
 * The save request does only trusted local work: validate,
 * canonicalize, dedupe, insert, enqueue. It performs NO network I/O,
 * so the person who pasted the link gets their card back in
 * milliseconds instead of waiting on someone else's web server. The
 * fetch happens in the ingestion job this enqueues.
 * ================================================================== */

import { logger } from "@/lib/observability/logger"
import { canonicalizeUrl, InvalidUrlError } from "@/lib/pocket2/domain/url"
import { ValidationError } from "@/lib/api-error"
import type { TenantContext } from "@/lib/pocket2/domain/authz"
import { getItem, saveItem } from "@/lib/pocket2/repo/items"
import { enqueueJob } from "@/lib/pocket2/repo/jobs"
import { withTenant } from "@/lib/pocket2/repo/tenant-db"
import type { SavedItemView } from "@/lib/pocket2/domain/types"

export interface SaveOutcome {
  item: SavedItemView
  /** true when this URL was already in the workspace's library. The UI
   * shows "Already saved — open it" rather than a second identical
   * card appearing silently. */
  duplicate: boolean
}

export async function saveUrl(ctx: TenantContext, rawUrl: string, title?: string): Promise<SaveOutcome> {
  // Validation happens before anything touches the database, and its
  // message is written for a person: "Only http and https links can be
  // saved", not "InvalidUrlError".
  try {
    canonicalizeUrl(rawUrl)
  } catch (error) {
    if (error instanceof InvalidUrlError) throw new ValidationError(error.message)
    throw error
  }

  // The insert, the per-user state row, the ingestion job and the
  // activity event all commit together inside one tenant scope.
  const { item, duplicate } = await withTenant(ctx.orgId, () =>
    saveItem(ctx.orgId, ctx.userId, rawUrl, { title: title ?? null }))

  logger.info(duplicate ? "pocket2_save_duplicate" : "pocket2_save_created", {
    organizationId: ctx.orgId, userId: ctx.userId, itemId: item.id, domain: item.domain,
  })

  // getItem returns the decorated view (state, tags, collections) the
  // card actually renders, so the client needs no second request.
  const view = await withTenant(ctx.orgId, () => getItem(ctx.orgId, ctx.userId, item.id))
  if (!view) throw new Error("Saved item disappeared immediately after being written.")
  return { item: view, duplicate }
}

/**
 * Re-run ingestion for an item whose first attempt failed.
 *
 * Explicitly user-initiated. A permanently failed job is never retried
 * on a schedule — repeatedly hammering a server that already answered
 * "no" is exactly what a well-behaved fetcher must not do.
 */
export async function reingest(ctx: TenantContext, itemId: string): Promise<SavedItemView | null> {
  const item = await withTenant(ctx.orgId, () => getItem(ctx.orgId, ctx.userId, itemId))
  if (!item) return null

  await withTenant(ctx.orgId, () =>
    enqueueJob(ctx.orgId, "metadata", item.id, { url: item.canonicalUrl, manual: true }))
  logger.info("pocket2_reingest_requested", { organizationId: ctx.orgId, itemId, domain: item.domain })
  return item
}

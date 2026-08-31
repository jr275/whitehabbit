/* ================================================================== *
 * SCOPED REPOSITORY — the repository as the application actually
 * reaches it.
 *
 * Repository functions require a tenant scope (row-level security has
 * to know which organization is acting), and in production the service
 * layer supplies it. These wrappers apply exactly the same scoping, so
 * tests exercise the real code path instead of a privileged shortcut
 * around it — and so a test cannot accidentally pass because it ran
 * outside RLS.
 *
 * Queue functions get withWorkerScope() for the same reason the worker
 * does: the queue is deliberately cross-tenant, and that scope is
 * accepted by `ingest_jobs` alone.
 * ================================================================== */

import * as items from "@/lib/pocket2/repo/items"
import * as labels from "@/lib/pocket2/repo/labels"
import * as jobs from "@/lib/pocket2/repo/jobs"
import * as ingestWrites from "@/lib/pocket2/repo/ingest-writes"
import { withTenant, withWorkerScope } from "@/lib/pocket2/repo/tenant-db"

export { withTenant, withWorkerScope }

/* ---- items (org scope, taken from the first argument) ------------ */
export const saveItem: typeof items.saveItem = (orgId, ...rest) =>
  withTenant(orgId, () => items.saveItem(orgId, ...rest))

export const getItem: typeof items.getItem = (orgId, ...rest) =>
  withTenant(orgId, () => items.getItem(orgId, ...rest))

export const listItems: typeof items.listItems = (orgId, ...rest) =>
  withTenant(orgId, () => items.listItems(orgId, ...rest))

export const updateItemState: typeof items.updateItemState = (orgId, ...rest) =>
  withTenant(orgId, () => items.updateItemState(orgId, ...rest))

export const deleteItem: typeof items.deleteItem = (orgId, ...rest) =>
  withTenant(orgId, () => items.deleteItem(orgId, ...rest))

export const getLibraryFacets: typeof items.getLibraryFacets = (orgId, ...rest) =>
  withTenant(orgId, () => items.getLibraryFacets(orgId, ...rest))

/* ---- labels ------------------------------------------------------ */
export const listCollections: typeof labels.listCollections = (orgId, ...rest) =>
  withTenant(orgId, () => labels.listCollections(orgId, ...rest))

export const listTags: typeof labels.listTags = (orgId, ...rest) =>
  withTenant(orgId, () => labels.listTags(orgId, ...rest))

/* ---- ingestion writes -------------------------------------------- */
export const applyIngestResult: typeof ingestWrites.applyIngestResult = (orgId, ...rest) =>
  withTenant(orgId, () => ingestWrites.applyIngestResult(orgId, ...rest))

export const recordIngestFailure: typeof ingestWrites.recordIngestFailure = (orgId, ...rest) =>
  withTenant(orgId, () => ingestWrites.recordIngestFailure(orgId, ...rest))

/* ---- queue (worker scope) ---------------------------------------- */
export const claimJobs: typeof jobs.claimJobs = (...args) =>
  withWorkerScope(() => jobs.claimJobs(...args))

export const completeJob: typeof jobs.completeJob = (...args) =>
  withWorkerScope(() => jobs.completeJob(...args))

export const failJob: typeof jobs.failJob = (...args) =>
  withWorkerScope(() => jobs.failJob(...args))

export const reapAbandonedJobs: typeof jobs.reapAbandonedJobs = () =>
  withWorkerScope(() => jobs.reapAbandonedJobs())

export const queueDepth: typeof jobs.queueDepth = () =>
  withWorkerScope(() => jobs.queueDepth())

/** enqueueJob is a TENANT action (a user asking for a re-ingest), not
 * a worker one, so it takes the org scope. */
export const enqueueJob: typeof jobs.enqueueJob = (orgId, ...rest) =>
  withTenant(orgId, () => jobs.enqueueJob(orgId, ...rest))

export { backoffMs } from "@/lib/pocket2/repo/jobs"

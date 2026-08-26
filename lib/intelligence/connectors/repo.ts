import "server-only"

/* ================================================================== *
 * DATA SOURCES / DATASETS (§20-21) — real persistence for the
 * connector framework, plus real freshness/staleness computation.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import { assertCapability } from "@/lib/workflow/permissions"
import { getConnector } from "./registry"
import type { FetchedRow } from "./types"

export type FreshnessPolicy = "real_time" | "hourly" | "daily" | "weekly" | "monthly" | "quarterly" | "static"

const FRESHNESS_WINDOW_MS: Record<FreshnessPolicy, number | null> = {
  real_time: 5 * 60_000,
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
  monthly: 30 * 24 * 60 * 60_000,
  quarterly: 90 * 24 * 60 * 60_000,
  static: null, // never considered stale
}

export interface DataSource {
  id: string
  orgId: string
  projectId: string
  name: string
  connector: string
  freshnessPolicy: FreshnessPolicy
  config: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

interface DataSourceRow {
  id: string
  org_id: string
  project_id: string
  name: string
  connector: string
  freshness_policy: FreshnessPolicy
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

function rowToDataSource(r: DataSourceRow): DataSource {
  return { id: r.id, orgId: r.org_id, projectId: r.project_id, name: r.name, connector: r.connector, freshnessPolicy: r.freshness_policy, config: r.config, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }
}

export class UnknownConnectorError extends Error {
  constructor(connector: string) {
    super(`"${connector}" is not a registered connector.`)
    this.name = "UnknownConnectorError"
  }
}

export async function createDataSource(input: { orgId: string; projectId: string; name: string; connector: string; freshnessPolicy?: FreshnessPolicy; config?: Record<string, unknown> }): Promise<DataSource> {
  if (!getConnector(input.connector)) throw new UnknownConnectorError(input.connector)
  const id = `ds_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO data_sources (id, org_id, project_id, name, connector, freshness_policy, config, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [id, input.orgId, input.projectId, input.name, input.connector, input.freshnessPolicy ?? "static", JSON.stringify(input.config ?? {}), now],
  )
  return (await getDataSource(id, input.orgId))!
}

export async function getDataSource(id: string, orgId: string): Promise<DataSource | null> {
  const row = await queryOne<DataSourceRow>("SELECT * FROM data_sources WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToDataSource(row) : null
}

export async function listDataSources(orgId: string, projectId: string): Promise<DataSource[]> {
  const rows = await query<DataSourceRow>("SELECT * FROM data_sources WHERE org_id = $1 AND project_id = $2 ORDER BY created_at DESC", [orgId, projectId])
  return rows.map(rowToDataSource)
}

export interface DatasetVersion {
  id: string
  orgId: string
  datasetId: string
  version: number
  rowCount: number
  fetchedAt: number
  isStale: boolean
}

interface DatasetVersionRow {
  id: string
  org_id: string
  dataset_id: string
  version: number
  row_count: number
  fetched_at: string
  is_stale: boolean
}

function rowToVersion(r: DatasetVersionRow): DatasetVersion {
  return { id: r.id, orgId: r.org_id, datasetId: r.dataset_id, version: r.version, rowCount: r.row_count, fetchedAt: Number(r.fetched_at), isStale: r.is_stale }
}

/** Real, computed staleness — never guessed. `static` datasets are
 * never stale; every other policy compares real elapsed time against
 * its real window (§21). */
export function isStale(freshnessPolicy: FreshnessPolicy, fetchedAt: number, now: number = Date.now()): boolean {
  const window = FRESHNESS_WINDOW_MS[freshnessPolicy]
  if (window === null) return false
  return now - fetchedAt > window
}

async function getOrCreateDataset(orgId: string, dataSourceId: string, name: string): Promise<string> {
  const existing = await queryOne<{ id: string }>("SELECT id FROM datasets WHERE data_source_id = $1 AND name = $2", [dataSourceId, name])
  if (existing) return existing.id
  const id = `dataset_${randomUUID()}`
  await query("INSERT INTO datasets (id, org_id, data_source_id, name, schema, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [id, orgId, dataSourceId, name, JSON.stringify({}), Date.now()])
  return id
}

/** The real ingestion path (§20): fetch -> validate -> persist a new
 * DatasetVersion + its DataObservations, in one transaction-equivalent
 * sequence. Never lets an invalid fetch silently become "truth" — a
 * validation failure throws rather than persisting partial/bad rows. */
export async function ingestDataset(orgId: string, dataSource: DataSource, datasetExternalId: string, datasetName: string): Promise<DatasetVersion> {
  assertCapability("DataIngestionAgent", "ingest_external_data")
  const connector = getConnector(dataSource.connector)
  if (!connector) throw new UnknownConnectorError(dataSource.connector)

  const rows: FetchedRow[] = await connector.fetch(dataSource.config, datasetExternalId)
  const validation = connector.validate(rows)
  if (!validation.valid) throw new Error(`Dataset "${datasetName}" failed validation: ${validation.errors.join("; ")}`)

  const datasetId = await getOrCreateDataset(orgId, dataSource.id, datasetName)
  const latest = await queryOne<{ version: number }>("SELECT version FROM dataset_versions WHERE dataset_id = $1 ORDER BY version DESC LIMIT 1", [datasetId])
  const version = (latest?.version ?? 0) + 1
  const now = Date.now()
  const versionId = `dsv_${randomUUID()}`
  await query(
    "INSERT INTO dataset_versions (id, org_id, dataset_id, version, row_count, fetched_at, is_stale, created_at) VALUES ($1, $2, $3, $4, $5, $6, FALSE, $6)",
    [versionId, orgId, datasetId, version, rows.length, now],
  )
  for (const row of rows) {
    const obsId = `dataobs_${randomUUID()}`
    await query("INSERT INTO data_observations (id, org_id, dataset_version_id, key, value, observed_at) VALUES ($1, $2, $3, $4, $5, $6)", [
      obsId,
      orgId,
      versionId,
      row.key,
      JSON.stringify(row.value),
      row.observedAt,
    ])
  }
  return { id: versionId, orgId, datasetId, version, rowCount: rows.length, fetchedAt: now, isStale: false }
}

export async function getLatestDatasetVersion(datasetId: string, orgId: string): Promise<DatasetVersion | null> {
  const row = await queryOne<DatasetVersionRow>("SELECT * FROM dataset_versions WHERE dataset_id = $1 AND org_id = $2 ORDER BY version DESC LIMIT 1", [datasetId, orgId])
  return row ? rowToVersion(row) : null
}

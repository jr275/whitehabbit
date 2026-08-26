import "server-only"

/* ================================================================== *
 * SEARCH CONSOLE — persistence (§12). Real schema, tenant-scoped.
 * Ingestion (populating these tables from real data) has two honest
 * paths: a live OAuth pull (lib/intelligence/search-console/live.ts —
 * requires real GOOGLE_SEARCH_CONSOLE_* credentials, fails loudly if
 * absent, exactly like lib/db/client.ts's DatabaseNotConfiguredError
 * discipline) or a manual import of a real GSC data export
 * (importSnapshot/importQueryObservations/importPageObservations below)
 * — never a fabricated snapshot either way (§40).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export interface SearchConsoleProperty {
  id: string
  orgId: string
  projectId: string
  siteUrl: string
  verified: boolean
  createdAt: number
}

interface PropertyRow {
  id: string
  org_id: string
  project_id: string
  site_url: string
  verified: boolean
  created_at: string
}

function rowToProperty(r: PropertyRow): SearchConsoleProperty {
  return { id: r.id, orgId: r.org_id, projectId: r.project_id, siteUrl: r.site_url, verified: r.verified, createdAt: Number(r.created_at) }
}

export async function createProperty(input: { orgId: string; projectId: string; siteUrl: string; verified?: boolean }): Promise<SearchConsoleProperty> {
  const id = `gscprop_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO search_console_properties (id, org_id, project_id, site_url, verified, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [
    id,
    input.orgId,
    input.projectId,
    input.siteUrl,
    input.verified ?? false,
    now,
  ])
  return { id, orgId: input.orgId, projectId: input.projectId, siteUrl: input.siteUrl, verified: input.verified ?? false, createdAt: now }
}

export async function getProperty(id: string, orgId: string): Promise<SearchConsoleProperty | null> {
  const row = await queryOne<PropertyRow>("SELECT * FROM search_console_properties WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToProperty(row) : null
}

export async function listProperties(orgId: string, projectId: string): Promise<SearchConsoleProperty[]> {
  const rows = await query<PropertyRow>("SELECT * FROM search_console_properties WHERE org_id = $1 AND project_id = $2", [orgId, projectId])
  return rows.map(rowToProperty)
}

export interface SearchConsoleSnapshot {
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export async function importSnapshot(orgId: string, propertyId: string, snapshot: SearchConsoleSnapshot): Promise<void> {
  const id = `gscsnap_${randomUUID()}`
  await query(
    `INSERT INTO search_console_snapshots (id, org_id, property_id, date, clicks, impressions, ctr, position, ingested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (property_id, date) DO UPDATE SET clicks = $5, impressions = $6, ctr = $7, position = $8, ingested_at = $9`,
    [id, orgId, propertyId, snapshot.date, snapshot.clicks, snapshot.impressions, snapshot.ctr, snapshot.position, Date.now()],
  )
}

export async function listSnapshots(propertyId: string, orgId: string, limit = 90): Promise<(SearchConsoleSnapshot & { orgId: string })[]> {
  const rows = await query<{ org_id: string; date: string; clicks: number; impressions: number; ctr: number; position: number }>(
    "SELECT org_id, date, clicks, impressions, ctr, position FROM search_console_snapshots WHERE property_id = $1 AND org_id = $2 ORDER BY date ASC LIMIT $3",
    [propertyId, orgId, limit],
  )
  return rows.map((r) => ({ orgId: r.org_id, date: r.date, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))
}

export interface SearchQueryObservationInput {
  date: string
  query: string
  country?: string | null
  device?: string | null
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export async function importQueryObservation(orgId: string, propertyId: string, obs: SearchQueryObservationInput): Promise<void> {
  const id = `gscq_${randomUUID()}`
  await query(
    `INSERT INTO search_query_observations (id, org_id, property_id, date, query, country, device, clicks, impressions, ctr, position, ingested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, orgId, propertyId, obs.date, obs.query, obs.country ?? null, obs.device ?? null, obs.clicks, obs.impressions, obs.ctr, obs.position, Date.now()],
  )
}

export async function listQueryObservations(propertyId: string, orgId: string, opts: { queryText?: string; limit?: number } = {}): Promise<(SearchQueryObservationInput & { orgId: string })[]> {
  const conditions = ["property_id = $1", "org_id = $2"]
  const params: unknown[] = [propertyId, orgId]
  if (opts.queryText) {
    params.push(opts.queryText)
    conditions.push(`query = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 200, 1000))
  const rows = await query<{ org_id: string; date: string; query: string; country: string | null; device: string | null; clicks: number; impressions: number; ctr: number; position: number }>(
    `SELECT org_id, date, query, country, device, clicks, impressions, ctr, position FROM search_query_observations WHERE ${conditions.join(" AND ")} ORDER BY date ASC LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => ({ orgId: r.org_id, date: r.date, query: r.query, country: r.country, device: r.device, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))
}

export interface SearchPageObservationInput {
  date: string
  pageUrl: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export async function importPageObservation(orgId: string, propertyId: string, obs: SearchPageObservationInput): Promise<void> {
  const id = `gscp_${randomUUID()}`
  await query(
    `INSERT INTO search_page_observations (id, org_id, property_id, date, page_url, clicks, impressions, ctr, position, ingested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, orgId, propertyId, obs.date, obs.pageUrl, obs.clicks, obs.impressions, obs.ctr, obs.position, Date.now()],
  )
}

export async function listPageObservations(propertyId: string, orgId: string, limit = 200): Promise<(SearchPageObservationInput & { orgId: string })[]> {
  const rows = await query<{ org_id: string; date: string; page_url: string; clicks: number; impressions: number; ctr: number; position: number }>(
    "SELECT org_id, date, page_url, clicks, impressions, ctr, position FROM search_page_observations WHERE property_id = $1 AND org_id = $2 ORDER BY date ASC LIMIT $3",
    [propertyId, orgId, limit],
  )
  return rows.map((r) => ({ orgId: r.org_id, date: r.date, pageUrl: r.page_url, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))
}

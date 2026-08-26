import "server-only"

/* ================================================================== *
 * WEBSITES — repository. Org/project-scoped throughout.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { Website, WebsiteDiscoveryStatus, WebsiteStatus } from "./model"

export class InvalidWebsiteUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidWebsiteUrlError"
  }
}

/** Real validation, not just "new URL() didn't throw" — only http(s) is
 * a fetchable website (§2 also rejects other schemes at fetch time;
 * this rejects them earlier, at input time, with a clearer message). */
export function normalizeWebsiteUrl(raw: string): { url: string; normalizedUrl: string; hostname: string } {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new InvalidWebsiteUrlError(`"${raw}" is not a valid URL.`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidWebsiteUrlError(`Only http/https website URLs are supported (got "${parsed.protocol}").`)
  }
  parsed.hash = ""
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) parsed.pathname = parsed.pathname.slice(0, -1)
  const normalizedUrl = parsed.toString().toLowerCase()
  return { url: parsed.toString(), normalizedUrl, hostname: parsed.hostname.toLowerCase() }
}

interface WebsiteSqlRow {
  id: string
  org_id: string
  project_id: string
  url: string
  normalized_url: string
  hostname: string
  status: WebsiteStatus
  discovery_status: WebsiteDiscoveryStatus
  discovery_error: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

function rowToWebsite(r: WebsiteSqlRow): Website {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    url: r.url,
    normalizedUrl: r.normalized_url,
    hostname: r.hostname,
    status: r.status,
    discoveryStatus: r.discovery_status,
    discoveryError: r.discovery_error,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    createdBy: r.created_by,
  }
}

export async function createWebsite(input: { orgId: string; projectId: string; url: string; createdBy?: string }): Promise<Website> {
  const { url, normalizedUrl, hostname } = normalizeWebsiteUrl(input.url)
  const id = `site_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO websites (id, org_id, project_id, url, normalized_url, hostname, status, discovery_status, created_at, updated_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'pending', $7, $7, $8)`,
    [id, input.orgId, input.projectId, url, normalizedUrl, hostname, now, input.createdBy ?? null],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    url,
    normalizedUrl,
    hostname,
    status: "pending",
    discoveryStatus: "pending",
    discoveryError: null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? null,
  }
}

export async function listWebsites(orgId: string, projectId: string): Promise<Website[]> {
  const rows = await query<WebsiteSqlRow>("SELECT * FROM websites WHERE org_id = $1 AND project_id = $2 ORDER BY created_at DESC", [orgId, projectId])
  return rows.map(rowToWebsite)
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the website doesn't belong to orgId. */
export async function getWebsite(id: string, orgId: string): Promise<Website | null> {
  const row = await queryOne<WebsiteSqlRow>("SELECT * FROM websites WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToWebsite(row) : null
}

export async function updateDiscoveryStatus(id: string, status: WebsiteDiscoveryStatus, error?: string | null): Promise<void> {
  const now = Date.now()
  const websiteStatus: WebsiteStatus = status === "failed" ? "failed" : status === "ready" ? "active" : "pending"
  await query("UPDATE websites SET discovery_status = $1, discovery_error = $2, status = $3, updated_at = $4 WHERE id = $5", [
    status,
    error ?? null,
    websiteStatus,
    now,
    id,
  ])
}

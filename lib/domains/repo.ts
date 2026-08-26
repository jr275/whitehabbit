import "server-only"

/* ================================================================== *
 * DOMAINS — repository. Real, org/project-scoped. `verificationToken`
 * is a real random value the tenant must publish in their own DNS —
 * never guessed, never assumed valid until lib/domains/verification.ts
 * actually checks it.
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { Domain, DomainKind, DomainVerificationAttempt, DomainVerificationMethod, DomainVerificationStatus } from "./model"

interface DomainSqlRow {
  id: string
  org_id: string
  project_id: string
  hostname: string
  kind: DomainKind
  verification_status: DomainVerificationStatus
  verification_method: DomainVerificationMethod | null
  verification_token: string
  is_primary: boolean
  created_at: string
  verified_at: string | null
}

function rowToDomain(r: DomainSqlRow): Domain {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    hostname: r.hostname,
    kind: r.kind,
    verificationStatus: r.verification_status,
    verificationMethod: r.verification_method,
    verificationToken: r.verification_token,
    isPrimary: r.is_primary,
    createdAt: Number(r.created_at),
    verifiedAt: r.verified_at ? Number(r.verified_at) : null,
  }
}

export class DuplicateHostnameError extends Error {
  constructor(hostname: string) {
    super(`"${hostname}" is already registered to a project.`)
    this.name = "DuplicateHostnameError"
  }
}

export async function createDomain(input: { orgId: string; projectId: string; hostname: string; kind: DomainKind }): Promise<Domain> {
  const id = `dom_${randomUUID()}`
  const now = Date.now()
  const verificationToken = randomBytes(16).toString("hex")
  try {
    await query(
      `INSERT INTO domains (id, org_id, project_id, hostname, kind, verification_status, verification_token, is_primary, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, FALSE, $7)`,
      [id, input.orgId, input.projectId, input.hostname.toLowerCase(), input.kind, verificationToken, now],
    )
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new DuplicateHostnameError(input.hostname)
    throw err
  }
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    hostname: input.hostname.toLowerCase(),
    kind: input.kind,
    verificationStatus: "pending",
    verificationMethod: null,
    verificationToken,
    isPrimary: false,
    createdAt: now,
    verifiedAt: null,
  }
}

export async function getDomain(id: string, orgId: string): Promise<Domain | null> {
  const row = await queryOne<DomainSqlRow>("SELECT * FROM domains WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToDomain(row) : null
}

export async function listDomainsForProject(orgId: string, projectId: string): Promise<Domain[]> {
  const rows = await query<DomainSqlRow>("SELECT * FROM domains WHERE org_id = $1 AND project_id = $2 ORDER BY created_at ASC", [orgId, projectId])
  return rows.map(rowToDomain)
}

/** Public resolution (§16-17): the ONLY function the public render path
 * may use to turn a request Host header into a tenant — returns null
 * for anything not VERIFIED, no matter how plausible the hostname
 * looks. Never takes an orgId/projectId parameter — the hostname IS
 * the untrusted input; the verified row is the only trusted output. */
export async function resolveVerifiedDomain(hostname: string): Promise<Domain | null> {
  const row = await queryOne<DomainSqlRow>("SELECT * FROM domains WHERE hostname = $1 AND verification_status = 'verified'", [hostname.toLowerCase()])
  return row ? rowToDomain(row) : null
}

export async function getPrimaryVerifiedDomain(orgId: string, projectId: string): Promise<Domain | null> {
  const row = await queryOne<DomainSqlRow>(
    "SELECT * FROM domains WHERE org_id = $1 AND project_id = $2 AND verification_status = 'verified' ORDER BY is_primary DESC, created_at ASC LIMIT 1",
    [orgId, projectId],
  )
  return row ? rowToDomain(row) : null
}

export async function markVerified(id: string, orgId: string, method: DomainVerificationMethod): Promise<void> {
  await query("UPDATE domains SET verification_status = 'verified', verification_method = $1, verified_at = $2 WHERE id = $3 AND org_id = $4", [
    method,
    Date.now(),
    id,
    orgId,
  ])
}

export async function markFailed(id: string, orgId: string): Promise<void> {
  await query("UPDATE domains SET verification_status = 'failed' WHERE id = $1 AND org_id = $2", [id, orgId])
}

export async function setPrimary(id: string, orgId: string, projectId: string): Promise<void> {
  await query("UPDATE domains SET is_primary = FALSE WHERE org_id = $1 AND project_id = $2", [orgId, projectId])
  await query("UPDATE domains SET is_primary = TRUE WHERE id = $1 AND org_id = $2", [id, orgId])
}

export async function recordVerificationAttempt(input: { orgId: string; domainId: string; method: DomainVerificationMethod; result: "success" | "failure"; detail: string | null }): Promise<DomainVerificationAttempt> {
  const id = `domver_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO domain_verifications (id, org_id, domain_id, method, result, detail, checked_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    id,
    input.orgId,
    input.domainId,
    input.method,
    input.result,
    input.detail,
    now,
  ])
  return { id, orgId: input.orgId, domainId: input.domainId, method: input.method, result: input.result, detail: input.detail, checkedAt: now }
}

export async function listVerificationAttempts(domainId: string, orgId: string): Promise<DomainVerificationAttempt[]> {
  const rows = await query<{ id: string; org_id: string; domain_id: string; method: DomainVerificationMethod; result: "success" | "failure"; detail: string | null; checked_at: string }>(
    "SELECT * FROM domain_verifications WHERE domain_id = $1 AND org_id = $2 ORDER BY checked_at DESC",
    [domainId, orgId],
  )
  return rows.map((r) => ({ id: r.id, orgId: r.org_id, domainId: r.domain_id, method: r.method, result: r.result, detail: r.detail, checkedAt: Number(r.checked_at) }))
}

/* ================================================================== *
 * DOMAINS (ADR-010, ADR-018) — real domain/subdomain management. A
 * domain is never treated as verified until a real DNS check proves
 * it — see lib/domains/verification.ts.
 * ================================================================== */

export type DomainKind = "subdomain" | "custom"
export type DomainVerificationStatus = "pending" | "verified" | "failed" | "expired"
export type DomainVerificationMethod = "dns_txt" | "dns_cname"

export interface Domain {
  id: string
  orgId: string
  projectId: string
  hostname: string
  kind: DomainKind
  verificationStatus: DomainVerificationStatus
  verificationMethod: DomainVerificationMethod | null
  verificationToken: string
  isPrimary: boolean
  createdAt: number
  verifiedAt: number | null
}

export interface DomainVerificationAttempt {
  id: string
  orgId: string
  domainId: string
  method: DomainVerificationMethod
  result: "success" | "failure"
  detail: string | null
  checkedAt: number
}

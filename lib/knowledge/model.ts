/* ================================================================== *
 * KNOWLEDGE GRAPH — domain types. See docs/adr/ADR-002,
 * docs/architecture/domain-model.md. No "server-only" here: these are
 * plain data shapes safe to import from client code (e.g. a future
 * Opportunities/Knowledge UI), matching lib/workforce/model.ts's own
 * pattern of keeping types separate from the server-only repo file.
 * ================================================================== */

export type VerificationStatus = "verified" | "unverified" | "conflicting" | "stale" | "deprecated"

export interface Entity {
  id: string
  orgId: string
  projectId: string
  entityType: string
  name: string
  canonicalEntityId: string | null
  attributes: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface EntityRelationship {
  id: string
  orgId: string
  projectId: string
  sourceEntityId: string
  targetEntityId: string
  relationshipType: string
  weight: number | null
  confidence: number | null
  source: string
  validFrom: number | null
  validTo: number | null
  createdAt: number
  updatedAt: number
}

export interface EntityEvidence {
  id: string
  orgId: string
  projectId: string
  entityId: string
  fact: string
  sourceUrl: string | null
  sourceType: string
  retrievedAt: number
  confidence: number | null
  verificationStatus: VerificationStatus
  createdAt: number
}

import "server-only"

/* ================================================================== *
 * EVIDENCE (§11, ADR-029) — unified provenance for artifacts beyond
 * entities (which already have entity_evidence, migrations/0002). See
 * ADR-029 for why these stay two tables rather than one migration.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export type EvidenceSubjectType = "opportunity" | "insight" | "page" | "answer" | "recommendation" | "fact"
export type EvidenceVerificationStatus = "verified" | "unverified" | "conflicting" | "stale" | "deprecated"

export interface Evidence {
  id: string
  orgId: string
  projectId: string
  subjectType: EvidenceSubjectType
  subjectId: string
  source: string
  sourceType: string
  sourceUrl: string | null
  retrievedAt: number
  publishedAt: number | null
  validFrom: number | null
  validUntil: number | null
  contentHash: string | null
  confidence: number
  verificationStatus: EvidenceVerificationStatus
  createdAt: number
}

interface EvidenceRow {
  id: string
  org_id: string
  project_id: string
  subject_type: EvidenceSubjectType
  subject_id: string
  source: string
  source_type: string
  source_url: string | null
  retrieved_at: string
  published_at: string | null
  valid_from: string | null
  valid_until: string | null
  content_hash: string | null
  confidence: number
  verification_status: EvidenceVerificationStatus
  created_at: string
}

function rowToEvidence(r: EvidenceRow): Evidence {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    source: r.source,
    sourceType: r.source_type,
    sourceUrl: r.source_url,
    retrievedAt: Number(r.retrieved_at),
    publishedAt: r.published_at ? Number(r.published_at) : null,
    validFrom: r.valid_from ? Number(r.valid_from) : null,
    validUntil: r.valid_until ? Number(r.valid_until) : null,
    contentHash: r.content_hash,
    confidence: r.confidence,
    verificationStatus: r.verification_status,
    createdAt: Number(r.created_at),
  }
}

export async function recordEvidence(input: {
  orgId: string
  projectId: string
  subjectType: EvidenceSubjectType
  subjectId: string
  source: string
  sourceType: string
  sourceUrl?: string | null
  retrievedAt?: number
  publishedAt?: number | null
  validFrom?: number | null
  validUntil?: number | null
  contentHash?: string | null
  confidence: number
  verificationStatus?: EvidenceVerificationStatus
}): Promise<Evidence> {
  const id = `evi_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO evidence (id, org_id, project_id, subject_type, subject_id, source, source_type, source_url, retrieved_at, published_at, valid_from, valid_until, content_hash, confidence, verification_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.subjectType,
      input.subjectId,
      input.source,
      input.sourceType,
      input.sourceUrl ?? null,
      input.retrievedAt ?? now,
      input.publishedAt ?? null,
      input.validFrom ?? null,
      input.validUntil ?? null,
      input.contentHash ?? null,
      input.confidence,
      input.verificationStatus ?? "unverified",
      now,
    ],
  )
  return (await getEvidence(id, input.orgId))!
}

export async function getEvidence(id: string, orgId: string): Promise<Evidence | null> {
  const row = await queryOne<EvidenceRow>("SELECT * FROM evidence WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToEvidence(row) : null
}

export async function listEvidenceForSubject(orgId: string, subjectType: EvidenceSubjectType, subjectId: string): Promise<Evidence[]> {
  const rows = await query<EvidenceRow>("SELECT * FROM evidence WHERE org_id = $1 AND subject_type = $2 AND subject_id = $3 ORDER BY retrieved_at DESC", [
    orgId,
    subjectType,
    subjectId,
  ])
  return rows.map(rowToEvidence)
}

import "server-only"

/* ================================================================== *
 * KNOWLEDGE GRAPH — repository. Every function is org- and project-
 * scoped and takes both explicitly, matching lib/db/repo.ts's own
 * convention. See docs/adr/ADR-002 for why this is relational
 * PostgreSQL, not a graph database, and why entity_type is free text.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { Entity, EntityEvidence, EntityRelationship, VerificationStatus } from "./model"

interface EntitySqlRow {
  id: string
  org_id: string
  project_id: string
  entity_type: string
  name: string
  canonical_entity_id: string | null
  attributes: Record<string, unknown>
  created_at: string
  updated_at: string
}

function rowToEntity(r: EntitySqlRow): Entity {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    entityType: r.entity_type,
    name: r.name,
    canonicalEntityId: r.canonical_entity_id,
    attributes: r.attributes ?? {},
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

/** Real, minimal Entity Resolution (ADR-002/ADR-009's stated v1 scope):
 * exact case-insensitive name+type match within the same project reuses
 * the existing row; anything else creates a new one. This is
 * deliberately NOT a semantic/fuzzy merge — see the ADRs for why a
 * fuller EntityResolutionAgent is deferred rather than approximated
 * here with an unreviewed heuristic merge. */
export async function upsertEntityByName(
  orgId: string,
  projectId: string,
  entityType: string,
  name: string,
  attributes: Record<string, unknown> = {},
): Promise<Entity> {
  const trimmedName = name.trim()
  const existing = await queryOne<EntitySqlRow>(
    "SELECT * FROM entities WHERE project_id = $1 AND entity_type = $2 AND lower(name) = lower($3)",
    [projectId, entityType, trimmedName],
  )
  if (existing) return rowToEntity(existing)

  const id = `entity_${randomUUID()}`
  const now = Date.now()
  await query(
    "INSERT INTO entities (id, org_id, project_id, entity_type, name, canonical_entity_id, attributes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $7)",
    [id, orgId, projectId, entityType, trimmedName, JSON.stringify(attributes), now],
  )
  return { id, orgId, projectId, entityType, name: trimmedName, canonicalEntityId: null, attributes, createdAt: now, updatedAt: now }
}

export async function listEntities(orgId: string, projectId: string, opts: { entityType?: string; limit?: number } = {}): Promise<Entity[]> {
  const limit = Math.min(opts.limit ?? 200, 500)
  if (opts.entityType) {
    const rows = await query<EntitySqlRow>(
      "SELECT * FROM entities WHERE org_id = $1 AND project_id = $2 AND entity_type = $3 ORDER BY created_at DESC LIMIT $4",
      [orgId, projectId, opts.entityType, limit],
    )
    return rows.map(rowToEntity)
  }
  const rows = await query<EntitySqlRow>("SELECT * FROM entities WHERE org_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT $3", [
    orgId,
    projectId,
    limit,
  ])
  return rows.map(rowToEntity)
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the entity doesn't belong to orgId. */
export async function getEntity(id: string, orgId: string): Promise<Entity | null> {
  const row = await queryOne<EntitySqlRow>("SELECT * FROM entities WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToEntity(row) : null
}

interface RelationshipSqlRow {
  id: string
  org_id: string
  project_id: string
  source_entity_id: string
  target_entity_id: string
  relationship_type: string
  weight: number | null
  confidence: number | null
  source: string
  valid_from: string | null
  valid_to: string | null
  created_at: string
  updated_at: string
}

function rowToRelationship(r: RelationshipSqlRow): EntityRelationship {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    sourceEntityId: r.source_entity_id,
    targetEntityId: r.target_entity_id,
    relationshipType: r.relationship_type,
    weight: r.weight,
    confidence: r.confidence,
    source: r.source,
    validFrom: r.valid_from ? Number(r.valid_from) : null,
    validTo: r.valid_to ? Number(r.valid_to) : null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

/** Relationships are first-class, real rows (§11) — never inferred at
 * read time. Idempotent-ish only in the sense that this always inserts
 * a new edge; callers that want "one edge of this type between these
 * two entities" are expected to check first (no unique constraint is
 * imposed here because a real graph can have multiple distinct edges
 * of the same type from different sources, e.g. two different runs
 * both asserting RELATED_TO with different confidence). */
export async function createRelationship(input: {
  orgId: string
  projectId: string
  sourceEntityId: string
  targetEntityId: string
  relationshipType: string
  weight?: number
  confidence?: number
  source: string
  validFrom?: number
  validTo?: number
}): Promise<EntityRelationship> {
  const id = `rel_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO entity_relationships (id, org_id, project_id, source_entity_id, target_entity_id, relationship_type, weight, confidence, source, valid_from, valid_to, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.sourceEntityId,
      input.targetEntityId,
      input.relationshipType,
      input.weight ?? null,
      input.confidence ?? null,
      input.source,
      input.validFrom ?? null,
      input.validTo ?? null,
      now,
    ],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    sourceEntityId: input.sourceEntityId,
    targetEntityId: input.targetEntityId,
    relationshipType: input.relationshipType,
    weight: input.weight ?? null,
    confidence: input.confidence ?? null,
    source: input.source,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function listRelationshipsForEntity(entityId: string, orgId: string): Promise<EntityRelationship[]> {
  const rows = await query<RelationshipSqlRow>(
    "SELECT * FROM entity_relationships WHERE org_id = $1 AND (source_entity_id = $2 OR target_entity_id = $2) ORDER BY created_at DESC",
    [orgId, entityId],
  )
  return rows.map(rowToRelationship)
}

interface EvidenceSqlRow {
  id: string
  org_id: string
  project_id: string
  entity_id: string
  fact: string
  source_url: string | null
  source_type: string
  retrieved_at: string
  confidence: number | null
  verification_status: VerificationStatus
  created_at: string
}

function rowToEvidence(r: EvidenceSqlRow): EntityEvidence {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    entityId: r.entity_id,
    fact: r.fact,
    sourceUrl: r.source_url,
    sourceType: r.source_type,
    retrievedAt: Number(r.retrieved_at),
    confidence: r.confidence,
    verificationStatus: r.verification_status,
    createdAt: Number(r.created_at),
  }
}

/** Real provenance per fact (§13, ADR-005). verificationStatus defaults
 * to "unverified" — callers must never pass "verified" unless a real
 * FactCheckAgent-equivalent cross-check actually produced this record;
 * nothing in this codebase does that yet. */
export async function addEvidence(input: {
  orgId: string
  projectId: string
  entityId: string
  fact: string
  sourceUrl?: string
  sourceType: string
  confidence?: number
  verificationStatus?: VerificationStatus
}): Promise<EntityEvidence> {
  const id = `evid_${randomUUID()}`
  const now = Date.now()
  const verificationStatus = input.verificationStatus ?? "unverified"
  await query(
    `INSERT INTO entity_evidence (id, org_id, project_id, entity_id, fact, source_url, source_type, retrieved_at, confidence, verification_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8)`,
    [id, input.orgId, input.projectId, input.entityId, input.fact, input.sourceUrl ?? null, input.sourceType, now, input.confidence ?? null, verificationStatus],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    entityId: input.entityId,
    fact: input.fact,
    sourceUrl: input.sourceUrl ?? null,
    sourceType: input.sourceType,
    retrievedAt: now,
    confidence: input.confidence ?? null,
    verificationStatus,
    createdAt: now,
  }
}

export async function listEvidenceForEntity(entityId: string, orgId: string): Promise<EntityEvidence[]> {
  const rows = await query<EvidenceSqlRow>("SELECT * FROM entity_evidence WHERE org_id = $1 AND entity_id = $2 ORDER BY retrieved_at DESC", [
    orgId,
    entityId,
  ])
  return rows.map(rowToEvidence)
}

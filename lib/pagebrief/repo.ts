import "server-only"

/* ================================================================== *
 * PAGE BRIEF — repository. Org/project-scoped.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { PageBrief } from "./model"

interface PageBriefSqlRow {
  id: string
  org_id: string
  project_id: string
  opportunity_id: string
  target_intent: string | null
  primary_entity_id: string | null
  secondary_entity_ids: string[]
  market: string | null
  role: string | null
  questions: string[]
  information_gain_strategy: string | null
  required_evidence: string[]
  recommended_sections: string[]
  schema_strategy: string[]
  internal_link_strategy: string | null
  source_requirements: string[]
  created_at: string
}

function rowToBrief(r: PageBriefSqlRow): PageBrief {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    opportunityId: r.opportunity_id,
    targetIntent: r.target_intent,
    primaryEntityId: r.primary_entity_id,
    secondaryEntityIds: r.secondary_entity_ids ?? [],
    market: r.market,
    role: r.role,
    questions: r.questions ?? [],
    informationGainStrategy: r.information_gain_strategy,
    requiredEvidence: r.required_evidence ?? [],
    recommendedSections: r.recommended_sections ?? [],
    schemaStrategy: r.schema_strategy ?? [],
    internalLinkStrategy: r.internal_link_strategy,
    sourceRequirements: r.source_requirements ?? [],
    createdAt: Number(r.created_at),
  }
}

export interface CreatePageBriefInput {
  orgId: string
  projectId: string
  opportunityId: string
  targetIntent: string | null
  primaryEntityId: string | null
  secondaryEntityIds: string[]
  market: string | null
  role: string | null
  questions: string[]
  informationGainStrategy: string | null
  requiredEvidence: string[]
  recommendedSections: string[]
  schemaStrategy: string[]
  internalLinkStrategy: string | null
  sourceRequirements: string[]
}

export async function createPageBrief(input: CreatePageBriefInput): Promise<PageBrief> {
  const id = `brief_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO page_briefs (
       id, org_id, project_id, opportunity_id, target_intent, primary_entity_id, secondary_entity_ids,
       market, role, questions, information_gain_strategy, required_evidence, recommended_sections,
       schema_strategy, internal_link_strategy, source_requirements, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.opportunityId,
      input.targetIntent,
      input.primaryEntityId,
      JSON.stringify(input.secondaryEntityIds),
      input.market,
      input.role,
      JSON.stringify(input.questions),
      input.informationGainStrategy,
      JSON.stringify(input.requiredEvidence),
      JSON.stringify(input.recommendedSections),
      JSON.stringify(input.schemaStrategy),
      input.internalLinkStrategy,
      JSON.stringify(input.sourceRequirements),
      now,
    ],
  )
  return { id, createdAt: now, ...input }
}

export async function getPageBrief(id: string, orgId: string): Promise<PageBrief | null> {
  const row = await queryOne<PageBriefSqlRow>("SELECT * FROM page_briefs WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToBrief(row) : null
}

export async function getPageBriefByOpportunity(opportunityId: string, orgId: string): Promise<PageBrief | null> {
  const row = await queryOne<PageBriefSqlRow>("SELECT * FROM page_briefs WHERE opportunity_id = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT 1", [
    opportunityId,
    orgId,
  ])
  return row ? rowToBrief(row) : null
}

/* ================================================================== *
 * PAGE BRIEF — domain types (§14). A structured specification for a
 * page, created when an Opportunity is approved — NOT the final
 * content.
 * ================================================================== */

export interface PageBrief {
  id: string
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
  createdAt: number
}

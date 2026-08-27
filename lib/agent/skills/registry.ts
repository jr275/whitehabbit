import "server-only"

import { applyMarketingRecommendationSkill } from "./apply-marketing-recommendation"
import { contentIntelligenceSkill } from "./content-intelligence"
import { creativeTerritoryGenerationSkill } from "./creative-territory-generation"
import { culturalIntelligenceSkill } from "./cultural-intelligence"
import { customerConversationSkill } from "./customer-conversation"
import { engagementAnalysisSkill } from "./engagement-analysis"
import { leadQualificationSkill } from "./lead-qualification"
import { runtimeProofSkill } from "./runtime-proof"
import { salesforceLeadPipelineSkill } from "./salesforce-lead-pipeline"
import { searchWasteDetectionSkill } from "./search-waste-detection"
import { seoOpportunitySkill } from "./seo-opportunity"
import { trendResearchSkill } from "./trend-research"
import type { SkillDefinition } from "@/lib/agent/types"

/* The full real-skill catalog — the capability layer shared across
 * every Product and every hand-built Worker. Products (lib/products/
 * catalog.ts) compose these same skills with product-specific
 * onboarding/knowledge/heuristics; they never fork a skill's code to
 * get product-specific behavior. Adding a new capability means adding
 * a definition here — Studio, Outputs Hub and the runtime do not
 * change.
 *
 * runtimeProofSkill is the one exception: it is NOT in the client-
 * facing lib/workforce/catalog.ts SKILL_CATALOG, so it never appears
 * in Studio or any product surface — it exists only so getSkill() can
 * resolve it for the runtime-hardening test suite (crash recovery,
 * concurrency, approval resume) and its own header explains why. */
export const SKILL_REGISTRY: SkillDefinition[] = [
  trendResearchSkill,
  contentIntelligenceSkill,
  engagementAnalysisSkill,
  leadQualificationSkill,
  seoOpportunitySkill,
  customerConversationSkill,
  culturalIntelligenceSkill,
  creativeTerritoryGenerationSkill,
  salesforceLeadPipelineSkill,
  searchWasteDetectionSkill,
  applyMarketingRecommendationSkill,
  runtimeProofSkill,
]

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILL_REGISTRY.find((s) => s.id === id)
}

import "server-only"

import { cashForecastSkill } from "./cash-forecast"
import { cashPositionMonitorSkill } from "./cash-position-monitor"
import { cashWorkingCapitalIntelligenceSkill } from "./cash-working-capital-intelligence"
import { contentIntelligenceSkill } from "./content-intelligence"
import { customerConversationSkill } from "./customer-conversation"
import { engagementAnalysisSkill } from "./engagement-analysis"
import { leadQualificationSkill } from "./lead-qualification"
import { receivablesRiskSkill } from "./receivables-risk"
import { seoOpportunitySkill } from "./seo-opportunity"
import { trendResearchSkill } from "./trend-research"
import { workingCapitalOpportunitySkill } from "./working-capital-opportunity"
import type { SkillDefinition } from "@/lib/agent/types"

/* The full real-skill catalog — the capability layer shared across
 * every Product and every hand-built Worker. Products (lib/products/
 * catalog.ts) compose these same skills with product-specific
 * onboarding/knowledge/heuristics; they never fork a skill's code to
 * get product-specific behavior. Adding a new capability means adding
 * a definition here — Studio, Outputs Hub and the runtime do not
 * change. */
export const SKILL_REGISTRY: SkillDefinition[] = [
  trendResearchSkill,
  contentIntelligenceSkill,
  engagementAnalysisSkill,
  leadQualificationSkill,
  seoOpportunitySkill,
  customerConversationSkill,
  cashPositionMonitorSkill,
  cashForecastSkill,
  workingCapitalOpportunitySkill,
  receivablesRiskSkill,
  cashWorkingCapitalIntelligenceSkill,
]

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILL_REGISTRY.find((s) => s.id === id)
}

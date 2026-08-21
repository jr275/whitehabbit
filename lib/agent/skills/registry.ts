import "server-only"

import { contentIntelligenceSkill } from "./content-intelligence"
import { engagementAnalysisSkill } from "./engagement-analysis"
import { trendResearchSkill } from "./trend-research"
import type { SkillDefinition } from "@/lib/agent/types"

/* The full real-skill catalog for this iteration: ONE vertical
 * (Marketing Intelligence), three real skill contracts. Adding a new
 * vertical means adding definitions here — Studio, Outputs Hub and the
 * runtime do not change. */
export const SKILL_REGISTRY: SkillDefinition[] = [trendResearchSkill, contentIntelligenceSkill, engagementAnalysisSkill]

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILL_REGISTRY.find((s) => s.id === id)
}

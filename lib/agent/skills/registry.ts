import "server-only"

import { contentIntelligenceSkill } from "./content-intelligence"
import { engagementAnalysisSkill } from "./engagement-analysis"
import { leadQualificationSkill } from "./lead-qualification"
import { trendResearchSkill } from "./trend-research"
import type { SkillDefinition } from "@/lib/agent/types"

/* The full real-skill catalog: two verticals (Marketing Intelligence,
 * Sales/Lead Generation), four real skill contracts. Adding a new
 * vertical means adding a definition here — Studio, Outputs Hub and
 * the runtime do not change. */
export const SKILL_REGISTRY: SkillDefinition[] = [trendResearchSkill, contentIntelligenceSkill, engagementAnalysisSkill, leadQualificationSkill]

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILL_REGISTRY.find((s) => s.id === id)
}

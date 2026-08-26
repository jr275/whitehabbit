/* ================================================================== *
 * OUTLINE — deterministic, no LLM call: distributes real research
 * claims across the PageBrief's recommended sections. Pure/testable.
 * ================================================================== */

import type { PageBrief } from "@/lib/pagebrief/model"
import type { OutlineArtifact, ResearchArtifact } from "./model"

export function buildOutline(brief: PageBrief, research: ResearchArtifact): OutlineArtifact {
  const headings = brief.recommendedSections.length ? brief.recommendedSections : ["Overview", "Key facts", "Sources"]
  const sections = headings.map((heading, i) => ({
    heading,
    claimIndices: research.claims.map((_, idx) => idx).filter((idx) => idx % headings.length === i),
  }))
  return { sections }
}

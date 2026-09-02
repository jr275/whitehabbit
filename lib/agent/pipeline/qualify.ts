import "server-only"

/* ================================================================== *
 * DETERMINISTIC QUALIFICATION — section 3. Runs BEFORE the LLM, on
 * pure structural checks against the real research output and the
 * operator's real target/criteria/constraints. No LLM call, no
 * randomness — the same candidate always yields the same score and
 * the same explanation for it.
 * ================================================================== */

import type { PipelineObjective, QualificationResult, ResearchCandidate } from "./types"

function textIncludes(haystack: string | null, needle: string): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

/**
 * Weighted, explainable scoring:
 *   - company fit (real, non-empty company name)          20%
 *   - location fit against the real target                20%
 *   - criteria keyword overlap against evidence/industry   20%
 *   - data completeness (website/industry/location/size)   20%
 *   - evidence quality (a real cited source + evidence text) 20%
 */
export function qualifyCandidate(candidate: ResearchCandidate, objective: PipelineObjective): QualificationResult {
  const reasons: string[] = []
  const missing: string[] = []
  let score = 0

  if (candidate.company && candidate.company.trim().length > 0) {
    score += 20
    reasons.push(`Real company name identified: "${candidate.company}".`)
  } else {
    missing.push("company")
  }

  if (objective.target) {
    if (textIncludes(candidate.location, objective.target)) {
      score += 20
      reasons.push(`Location "${candidate.location}" matches target "${objective.target}".`)
    } else if (candidate.location) {
      reasons.push(`Location "${candidate.location}" does not clearly match target "${objective.target}".`)
    } else {
      missing.push("location")
    }
  } else {
    // no explicit target given — location fit is neither earned nor penalized
    score += 10
    if (!candidate.location) missing.push("location")
  }

  const criteriaTerms = [...objective.criteria, ...(objective.target ? [objective.target] : [])]
  if (criteriaTerms.length > 0) {
    const matched = criteriaTerms.filter((term) => textIncludes(candidate.evidence, term) || textIncludes(candidate.industry, term))
    if (matched.length > 0) {
      score += Math.round(20 * Math.min(1, matched.length / criteriaTerms.length))
      reasons.push(`Evidence/industry supports ${matched.length}/${criteriaTerms.length} stated criteria: ${matched.join(", ")}.`)
    } else {
      reasons.push("No stated criteria are supported by the available evidence.")
    }
  } else {
    score += 10
  }

  const fields: [string, string | null][] = [
    ["website", candidate.website],
    ["industry", candidate.industry],
    ["location", candidate.location],
    ["employeeRange", candidate.employeeRange],
  ]
  const known = fields.filter(([, v]) => v != null && v !== "").length
  const completeness = known / fields.length
  score += Math.round(20 * completeness)
  reasons.push(`${known}/${fields.length} firmographic fields known (${Math.round(completeness * 100)}% data completeness).`)
  for (const [name, v] of fields) if (v == null || v === "") missing.push(name)

  const hasSource = candidate.source && /^https?:\/\//.test(candidate.source)
  const evidenceQuality = (hasSource ? 0.5 : 0) + Math.min(0.5, candidate.evidence.trim().length / 200)
  score += Math.round(20 * evidenceQuality)
  reasons.push(hasSource ? "Evidence cites a real source URL." : "Evidence does not cite a real, resolvable source URL.")

  const qualificationScore = Math.max(0, Math.min(100, Math.round(score)))
  // confidence tracks how much of the scoring was backed by real data
  // vs. neutral defaults for missing target/criteria — never invented.
  const confidence = Math.round(Math.min(100, qualificationScore * (1 - missing.length / (fields.length + 1)) + 10))

  return {
    candidateId: candidate.id,
    qualificationScore,
    qualificationReasons: reasons,
    missingInformation: Array.from(new Set(missing)),
    confidence: Math.max(0, Math.min(100, confidence)),
  }
}

export function qualifyAll(candidates: ResearchCandidate[], objective: PipelineObjective): QualificationResult[] {
  return candidates.map((c) => qualifyCandidate(c, objective))
}

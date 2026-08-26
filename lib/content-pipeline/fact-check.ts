/* ================================================================== *
 * FACT CHECK AGENT (§22/§24) — operates on the draft's own structured
 * claim citations against the real ResearchArtifact, exactly the
 * evidence-confidence signal already computed from entity_evidence
 * (lib/content-pipeline/research.ts) — never a second LLM opinion
 * about whether the first LLM told the truth. Deterministic, real,
 * fully unit-testable.
 * ================================================================== */

import type { DraftArtifact, ResearchArtifact } from "./model"

export type ClaimVerificationState = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "CONFLICTING"

export interface FactCheckResult {
  claimIndex: number
  state: ClaimVerificationState
  note: string
}

export interface FactCheckArtifact {
  results: FactCheckResult[]
  /** true only if every cited claim is at least PARTIALLY_VERIFIED —
   * never true when nothing was cited (an empty draft isn't "verified"). */
  allCitedVerified: boolean
}

const VERIFIED_THRESHOLD = 0.8
const PARTIAL_THRESHOLD = 0.5

export function runFactCheck(draft: DraftArtifact, research: ResearchArtifact): FactCheckArtifact {
  const citedIndices = [...new Set(draft.sections.flatMap((s) => s.claimIndices))].sort((a, b) => a - b)
  const results: FactCheckResult[] = citedIndices.map((idx) => {
    const claim = research.claims[idx]
    if (!claim) {
      return { claimIndex: idx, state: "CONFLICTING", note: `The draft cites claim index ${idx}, which does not exist in the research artifact.` }
    }
    const confidence = claim.confidence
    const state: ClaimVerificationState = confidence >= VERIFIED_THRESHOLD ? "VERIFIED" : confidence >= PARTIAL_THRESHOLD ? "PARTIALLY_VERIFIED" : "UNVERIFIED"
    return { claimIndex: idx, state, note: `Backed by evidence with ${Math.round(confidence * 100)}% confidence.` }
  })

  return {
    results,
    allCitedVerified: results.length > 0 && results.every((r) => r.state === "VERIFIED" || r.state === "PARTIALLY_VERIFIED"),
  }
}

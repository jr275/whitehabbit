/* ================================================================== *
 * INFORMATION GAIN — the first deterministic model (§12). Not an LLM
 * opinion: every point is earned by a real, countable signal, and the
 * reasons[] output states exactly which signals fired. This amends
 * docs/adr/ADR-015, which — before this model existed — correctly
 * stated informationGainScore must stay NULL; see that ADR's amendment
 * note for the full reasoning.
 * ================================================================== */

export interface InformationGainInput {
  /** distinct OTHER canonical entities related to this opportunity's
   * primary entity (a real graph signal — richer surrounding context) */
  relatedEntityCount: number
  /** distinct source URLs backing this entity's evidence */
  sourceDiversity: number
  /** entity_evidence rows sourced from real structured data (JSON-LD)
   * on the tenant's own site — a first-party, verifiable fact */
  structuredDataEvidenceCount: number
  /** whether any evidence for this entity is Place/Market-typed —
   * local specificity a generic competitor page is less likely to have */
  hasLocalEvidence: boolean
  /** other canonical entities of the SAME type in this project —
   * enables a real comparison/benchmark angle */
  siblingEntityCount: number
  /** an existing Page already targets this exact primary entity */
  existingPageForEntity: boolean
}

export interface InformationGainResult {
  score: number
  reasons: string[]
}

/** Every branch is additive and documented — the score is the sum of
 * real, named reasons, capped at 100, then discounted if an equivalent
 * page already exists (§19: information gain is about UNIQUE value,
 * and a second page covering ground the tenant already covers is
 * worth less almost by definition). */
export function computeInformationGain(input: InformationGainInput): InformationGainResult {
  const reasons: string[] = []
  let score = 0

  if (input.relatedEntityCount > 0) {
    const points = Math.min(20, input.relatedEntityCount * 10)
    score += points
    reasons.push(`${input.relatedEntityCount} related entit${input.relatedEntityCount === 1 ? "y provides" : "ies provide"} real supporting context (+${points})`)
  }

  if (input.sourceDiversity > 0) {
    const points = Math.min(15, input.sourceDiversity * 7)
    score += points
    reasons.push(`${input.sourceDiversity} distinct source${input.sourceDiversity === 1 ? "" : "s"} back this entity's evidence (+${points})`)
  }

  if (input.structuredDataEvidenceCount > 0) {
    score += 20
    reasons.push(`${input.structuredDataEvidenceCount} verified first-party structured-data fact${input.structuredDataEvidenceCount === 1 ? "" : "s"} available (+20)`)
  }

  if (input.hasLocalEvidence) {
    score += 15
    reasons.push("Local/place-specific data is available for this entity (+15)")
  }

  if (input.siblingEntityCount > 0) {
    score += 20
    reasons.push(`${input.siblingEntityCount} comparable entit${input.siblingEntityCount === 1 ? "y enables" : "ies enable"} a real comparison angle (+20)`)
  }

  if (!input.existingPageForEntity) {
    score += 10
    reasons.push("No existing page currently targets this entity (+10)")
  } else {
    reasons.push("An equivalent page already exists for this entity — unique value is reduced (score discounted 25%)")
    score = score * 0.75
  }

  if (reasons.length === 0 || score === 0) {
    reasons.push("No information-gain signals were found for this entity — coverage, sourcing, and comparison data are all currently absent.")
  }

  return { score: Math.round(Math.min(100, score)), reasons }
}

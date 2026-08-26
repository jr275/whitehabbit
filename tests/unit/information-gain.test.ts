import { describe, expect, it } from "vitest"
import { computeInformationGain } from "@/lib/opportunity/information-gain"

/* §12: Information Gain must be a deterministic model, never an LLM
 * opinion — same input always produces the same score and reasons. */

describe("computeInformationGain", () => {
  it("is fully deterministic for identical input", () => {
    const input = { relatedEntityCount: 2, sourceDiversity: 2, structuredDataEvidenceCount: 1, hasLocalEvidence: true, siblingEntityCount: 1, existingPageForEntity: false }
    expect(computeInformationGain(input)).toEqual(computeInformationGain(input))
  })

  it("scores 0 with an honest reason when literally no signal is present", () => {
    // existingPageForEntity: true so the "no existing page" bonus
    // doesn't fire either — genuinely zero information-gain signals.
    const result = computeInformationGain({ relatedEntityCount: 0, sourceDiversity: 0, structuredDataEvidenceCount: 0, hasLocalEvidence: false, siblingEntityCount: 0, existingPageForEntity: true })
    expect(result.score).toBe(0)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it("still awards the real 'no existing page' signal even with no other signals present", () => {
    const result = computeInformationGain({ relatedEntityCount: 0, sourceDiversity: 0, structuredDataEvidenceCount: 0, hasLocalEvidence: false, siblingEntityCount: 0, existingPageForEntity: false })
    expect(result.score).toBe(10)
  })

  it("rewards real, distinct signals with real, attributed reasons", () => {
    const result = computeInformationGain({ relatedEntityCount: 3, sourceDiversity: 3, structuredDataEvidenceCount: 2, hasLocalEvidence: true, siblingEntityCount: 2, existingPageForEntity: false })
    expect(result.score).toBeGreaterThan(50)
    expect(result.reasons.length).toBeGreaterThanOrEqual(4)
  })

  it("discounts the score when an equivalent page already exists", () => {
    const withoutPage = computeInformationGain({ relatedEntityCount: 2, sourceDiversity: 2, structuredDataEvidenceCount: 1, hasLocalEvidence: false, siblingEntityCount: 1, existingPageForEntity: false })
    const withPage = computeInformationGain({ relatedEntityCount: 2, sourceDiversity: 2, structuredDataEvidenceCount: 1, hasLocalEvidence: false, siblingEntityCount: 1, existingPageForEntity: true })
    expect(withPage.score).toBeLessThan(withoutPage.score)
  })

  it("never exceeds 100", () => {
    const result = computeInformationGain({ relatedEntityCount: 50, sourceDiversity: 50, structuredDataEvidenceCount: 50, hasLocalEvidence: true, siblingEntityCount: 50, existingPageForEntity: false })
    expect(result.score).toBeLessThanOrEqual(100)
  })
})

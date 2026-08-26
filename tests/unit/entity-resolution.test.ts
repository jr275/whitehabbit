import { describe, expect, it } from "vitest"
import { decideResolution, nameSimilarity, normalizeEntityName } from "@/lib/knowledge/resolution"

/* §7: Entity Resolution — thresholds must be real and never silently
 * merge a low-confidence match. */

describe("normalizeEntityName", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeEntityName("  Acme, Corp.  ")).toBe("acme corp")
  })
})

describe("nameSimilarity", () => {
  it("is 1 for identical names (after normalization)", () => {
    expect(nameSimilarity("Acme Corp", "acme corp")).toBe(1)
  })

  it("is high for a near-duplicate name", () => {
    expect(nameSimilarity("Acme Corporation", "Acme Corp")).toBeGreaterThan(0.6)
  })

  it("is low for unrelated names", () => {
    expect(nameSimilarity("Acme Corporation", "Totally Different Business")).toBeLessThan(0.3)
  })
})

describe("decideResolution", () => {
  const candidates = [
    { id: "e1", name: "Moema" },
    { id: "e2", name: "Downtown Historic District" },
  ]

  it("auto-merges only when similarity meets the configured auto-merge threshold", () => {
    const result = decideResolution("moema", candidates, { autoMerge: 0.95, review: 0.75 })
    expect(result.decision).toBe("auto_merge")
    expect(result.bestMatch?.id).toBe("e1")
  })

  it("never auto-merges a mid-confidence match — only flags it for review", () => {
    // deliberately a real but partial overlap, well below auto-merge
    const result = decideResolution("Moema Region", candidates, { autoMerge: 0.95, review: 0.5 })
    expect(result.decision).not.toBe("auto_merge")
    expect(result.decision).toBe("review_candidate")
  })

  it("keeps genuinely distinct entities fully separate", () => {
    const result = decideResolution("Completely Unrelated Entity Name", candidates)
    expect(result.decision).toBe("distinct")
    expect(result.bestMatch).toBeNull()
  })

  it("is distinct (not a crash) when there are no existing candidates", () => {
    const result = decideResolution("Anything", [])
    expect(result.decision).toBe("distinct")
  })
})

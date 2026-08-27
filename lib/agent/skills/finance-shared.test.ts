import { describe, expect, it } from "vitest"
import {
  economicImpactMetric,
  evaluateFinancialFindings,
  parseFinancialFindings,
  renderFinancialFindingsSummary,
  type FinancialFinding,
  type FinancialFindingsPayload,
} from "./finance-shared"

function finding(overrides: Partial<FinancialFinding> = {}): FinancialFinding {
  return {
    finding: "Receivables concentration increased.",
    evidence: "50% of receivables depend on 2 customers.",
    metric_label: "Top-2 concentration",
    metric_value: 50,
    metric_unit: "%",
    recommendation: "Review payment terms for the top two customers.",
    impact_value: 82_000,
    impact_unit: "$",
    confidence: 84,
    risk: "medium",
    ...overrides,
  }
}

describe("parseFinancialFindings", () => {
  it("parses a well-formed findings payload", () => {
    const text = JSON.stringify({ findings: [finding()] })
    const parsed = parseFinancialFindings(text)
    expect(parsed?.findings).toHaveLength(1)
    expect(parsed?.findings[0].metric_value).toBe(50)
  })

  it("strips a markdown code fence before parsing", () => {
    const text = "```json\n" + JSON.stringify({ findings: [] }) + "\n```"
    const parsed = parseFinancialFindings(text)
    expect(parsed?.findings).toEqual([])
  })

  it("returns null for invalid JSON rather than throwing", () => {
    expect(parseFinancialFindings("not json")).toBeNull()
  })

  it("returns null when the shape doesn't include a findings array", () => {
    expect(parseFinancialFindings(JSON.stringify({ opportunities: [] }))).toBeNull()
  })
})

describe("evaluateFinancialFindings — explainable confidence, never a single opaque number", () => {
  it("names all five dimensions the brief requires", () => {
    const payload: FinancialFindingsPayload = { findings: [finding()] }
    const evaluation = evaluateFinancialFindings(payload, [50, 82_000], 1)
    const labels = evaluation.breakdown.map((b) => b.label)
    expect(labels).toEqual(["Data completeness", "Data freshness", "Historical consistency", "Model confidence", "Evidence quality"])
  })

  it("scores historical consistency down when a finding cites a number absent from the source ledger", () => {
    const grounded: FinancialFindingsPayload = { findings: [finding({ metric_value: 50 })] }
    const fabricated: FinancialFindingsPayload = { findings: [finding({ metric_value: 999_999, impact_value: 999_999 })] }
    const ledgerNumbers = [50, 82_000]
    const groundedScore = evaluateFinancialFindings(grounded, ledgerNumbers, 1).breakdown.find((b) => b.label === "Historical consistency")!.score
    const fabricatedScore = evaluateFinancialFindings(fabricated, ledgerNumbers, 1).breakdown.find((b) => b.label === "Historical consistency")!.score
    expect(groundedScore).toBe(100)
    expect(fabricatedScore).toBe(0)
  })

  it("never produces a quality score outside 0-100", () => {
    const empty: FinancialFindingsPayload = { findings: [] }
    const evaluation = evaluateFinancialFindings(empty, [], 1)
    expect(evaluation.qualityScore).toBeGreaterThanOrEqual(0)
    expect(evaluation.qualityScore).toBeLessThanOrEqual(100)
  })
})

describe("economicImpactMetric — CRITICAL: estimated value must never be confused with verified value", () => {
  it("always emits economicState \"estimated\" for a freshly computed impact", () => {
    const payload: FinancialFindingsPayload = { findings: [finding({ impact_value: 82_000, impact_unit: "$" })] }
    const metric = economicImpactMetric(payload, "savings", "working_capital_released", "$")
    expect(metric).not.toBeNull()
    expect(metric!.economicState).toBe("estimated")
    expect(metric!.economicState).not.toBe("verified")
    expect(metric!.economicState).not.toBe("realized")
    expect(metric!.economicState).not.toBe("approved")
    expect(metric!.economicState).not.toBe("executed")
  })

  it("returns null rather than emitting a fabricated $0 when no finding quantifies an impact", () => {
    const payload: FinancialFindingsPayload = { findings: [finding({ impact_value: 0, impact_unit: "" })] }
    expect(economicImpactMetric(payload, "savings", "working_capital_released", "$")).toBeNull()
  })

  it("only sums findings matching the requested unit — a % finding never inflates a $ metric", () => {
    const payload: FinancialFindingsPayload = {
      findings: [finding({ impact_value: 82_000, impact_unit: "$" }), finding({ impact_value: 15, impact_unit: "%" })],
    }
    const metric = economicImpactMetric(payload, "savings", "working_capital_released", "$")
    expect(metric!.value).toBe(82_000)
  })
})

describe("renderFinancialFindingsSummary", () => {
  it("never asserts a value was realized — impact is always labeled estimated in the rendered text", () => {
    const payload: FinancialFindingsPayload = { findings: [finding({ impact_value: 82_000, impact_unit: "$" })] }
    const summary = renderFinancialFindingsSummary(payload, "none")
    expect(summary).toContain("estimated")
    expect(summary.toLowerCase()).not.toContain("generated")
    expect(summary.toLowerCase()).not.toContain("realized")
  })

  it("returns the honest none-message when there are zero findings, never inventing one", () => {
    const summary = renderFinancialFindingsSummary({ findings: [] }, "No risk was identified.")
    expect(summary).toBe("No risk was identified.")
  })
})

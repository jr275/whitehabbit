import { describe, expect, it } from "vitest"
import { detectTrend, DEFAULT_TREND_THRESHOLDS } from "@/lib/intelligence/trend-engine"

describe("detectTrend (§15)", () => {
  it("reports stable, zero-confidence with fewer than 2 periods — never guesses a direction", () => {
    const result = detectTrend([{ period: "2026-W01", volume: 100 }])
    expect(result.state).toBe("stable")
    expect(result.confidence).toBe(0)
  })

  it("reports emerging for a genuinely new signal with no prior baseline", () => {
    const result = detectTrend([
      { period: "2026-W01", volume: 0 },
      { period: "2026-W02", volume: 50 },
    ])
    expect(result.state).toBe("emerging")
  })

  it("reports breaking for a real >100% spike with sufficient volume", () => {
    const result = detectTrend([
      { period: "2026-W01", volume: 100 },
      { period: "2026-W02", volume: 250 },
    ])
    expect(result.state).toBe("breaking")
    expect(result.velocity).toBeCloseTo(150, 0)
  })

  it("reports rising for a real +30-100% increase", () => {
    const result = detectTrend([
      { period: "2026-W01", volume: 100 },
      { period: "2026-W02", volume: 145 },
    ])
    expect(result.state).toBe("rising")
  })

  it("reports declining for a real drop past the decline threshold", () => {
    const result = detectTrend([
      { period: "2026-W01", volume: 100 },
      { period: "2026-W02", volume: 60 },
    ])
    expect(result.state).toBe("declining")
  })

  it("reports stable within the stable band", () => {
    const result = detectTrend([
      { period: "2026-W01", volume: 100 },
      { period: "2026-W02", volume: 105 },
    ])
    expect(result.state).toBe("stable")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("never reports a trend below the minimum volume floor — noise, not a trend", () => {
    const result = detectTrend([
      { period: "2026-W01", volume: 1 },
      { period: "2026-W02", volume: 3 }, // +200% but tiny real volume
    ])
    expect(result.state).toBe("stable")
    expect(result.confidence).toBeLessThan(0.5)
  })

  it("computes real acceleration once a third period exists", () => {
    const result = detectTrend([
      { period: "2026-W01", volume: 100 },
      { period: "2026-W02", volume: 150 }, // +50%
      { period: "2026-W03", volume: 300 }, // +100%
    ])
    expect(result.acceleration).not.toBeNull()
    expect(result.acceleration!).toBeGreaterThan(0) // velocity is accelerating
  })

  it("respects configurable thresholds — a custom stricter threshold changes the classification", () => {
    const points = [
      { period: "2026-W01", volume: 100 },
      { period: "2026-W02", volume: 135 },
    ]
    const strict = detectTrend(points, { ...DEFAULT_TREND_THRESHOLDS, risingVelocityPct: 50 })
    expect(strict.state).not.toBe("rising") // 35% no longer clears a 50% bar
  })
})

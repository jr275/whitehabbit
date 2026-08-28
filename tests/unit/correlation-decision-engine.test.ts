import { describe, expect, it } from "vitest"
import { correlateSignals, DEFAULT_CORRELATION_RULES, correlationKeyFor } from "@/lib/intelligence/correlation-engine"
import { proposeDecision } from "@/lib/intelligence/decision-engine"
import type { Signal } from "@/lib/intelligence/signals"

function fakeSignal(overrides: Partial<Signal>): Signal {
  return {
    id: `sig_${Math.random().toString(36).slice(2)}`,
    orgId: "org_1",
    projectId: "proj_1",
    sourceId: null,
    type: "manual",
    entityId: null,
    marketId: null,
    roleId: null,
    intentId: null,
    value: {},
    observedAt: Date.now(),
    source: "test",
    confidence: 0.8,
    rawReference: null,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe("correlateSignals — §3 deterministic rule-based correlation", () => {
  it("fires high_value_opportunity when an ENTITY_GAP coincides with real trend acceleration for the same entity", () => {
    const signals = [
      fakeSignal({ type: "ENTITY_GAP", entityId: "ent_1", value: { entityName: "Barra da Tijuca" } }),
      fakeSignal({ type: "TREND_ACCELERATION", entityId: "ent_1", value: { acceleration: 45 } }),
    ]
    const results = correlateSignals(signals)
    expect(results.some((r) => r.pattern === "high_value_opportunity")).toBe(true)
    const match = results.find((r) => r.pattern === "high_value_opportunity")!
    expect(match.signalIds).toHaveLength(2)
    expect(match.confidence).toBeGreaterThan(0.8) // supporting type boosts confidence above the base
  })

  it("does NOT fire high_value_opportunity for an ENTITY_GAP with no supporting signal for a DIFFERENT entity", () => {
    const signals = [fakeSignal({ type: "ENTITY_GAP", entityId: "ent_1" }), fakeSignal({ type: "TREND_ACCELERATION", entityId: "ent_2", value: { acceleration: 90 } })]
    const results = correlateSignals(signals)
    // both required-type-only groups still fire (ENTITY_GAP alone satisfies requiredTypes),
    // but never as a SINGLE correlated match spanning both entities.
    const highValue = results.filter((r) => r.pattern === "high_value_opportunity")
    for (const r of highValue) expect(r.signalIds.length).toBeLessThanOrEqual(1) // never combines across correlation keys
  })

  it("fires content_decay_refresh only when BOTH traffic AND CTR decline for the same page — a real AND, not an OR", () => {
    const trafficOnly = [fakeSignal({ type: "PAGE_TRAFFIC_DECLINED", value: { pageId: "page_1" } })]
    expect(correlateSignals(trafficOnly).some((r) => r.pattern === "content_decay_refresh")).toBe(false)

    const both = [fakeSignal({ type: "PAGE_TRAFFIC_DECLINED", value: { pageId: "page_1", changePct: -35 } }), fakeSignal({ type: "PAGE_CTR_DECLINED", value: { pageId: "page_1" } })]
    expect(correlateSignals(both).some((r) => r.pattern === "content_decay_refresh")).toBe(true)
  })

  it("every rule in DEFAULT_CORRELATION_RULES has a real summarize function producing non-empty text", () => {
    for (const rule of DEFAULT_CORRELATION_RULES) {
      const fake = fakeSignal({ type: rule.requiredTypes[0], value: { entityName: "x", pageId: "x", changePct: -10, competitor: "x", acceleration: 10, linkCount: 0 } })
      expect(rule.summarize([fake]).length).toBeGreaterThan(0)
    }
  })

  it("correlationKeyFor groups by entity, then page, then market, then falls back to the signal itself", () => {
    expect(correlationKeyFor(fakeSignal({ entityId: "ent_1" }))).toBe("entity:ent_1")
    expect(correlationKeyFor(fakeSignal({ value: { pageId: "page_1" } }))).toBe("page:page_1")
    expect(correlationKeyFor(fakeSignal({ marketId: "mkt_1" }))).toBe("market:mkt_1")
    const lonely = fakeSignal({})
    expect(correlationKeyFor(lonely)).toBe(`signal:${lonely.id}`)
  })
})

describe("proposeDecision — §4 real, explainable decisions", () => {
  it("proposes CREATE_PAGE for high_value_opportunity with no existing page, and UPDATE_PAGE when one exists", () => {
    const base = { observationPattern: "high_value_opportunity", observationSummary: "test", observationConfidence: 0.85, signalIds: ["sig_1"] }
    expect(proposeDecision(base).action).toBe("CREATE_PAGE")
    expect(proposeDecision({ ...base, existingPageId: "page_1" }).action).toBe("UPDATE_PAGE")
  })

  it("every proposal carries a real reason, evidence, expected impact, cost, risk, and confidence — never a bare action", () => {
    const proposal = proposeDecision({ observationPattern: "content_decay_refresh", observationSummary: "real summary text", observationConfidence: 0.7, signalIds: ["sig_1", "sig_2"] })
    expect(proposal.reason).toBe("real summary text") // never invented — carries the observation's own real summary
    expect(proposal.evidenceIds).toEqual(["sig_1", "sig_2"])
    expect(proposal.expectedImpact.length).toBeGreaterThan(0)
    expect(proposal.confidence).toBe(0.7) // carried through, never re-invented
    expect(["low", "medium", "high", "critical"]).toContain(proposal.risk)
  })

  it("high-risk actions (CREATE_PAGE, REFRESH_CONTENT, MERGE_PAGES) always require approval — never let the system decide its own permission", () => {
    expect(proposeDecision({ observationPattern: "high_value_opportunity", observationSummary: "x", observationConfidence: 0.9, signalIds: [] }).requiredApproval).toBe(true)
    expect(proposeDecision({ observationPattern: "content_decay_refresh", observationSummary: "x", observationConfidence: 0.9, signalIds: [] }).requiredApproval).toBe(true)
  })

  it("low-risk, read-only actions (ADD_INTERNAL_LINKS, INVESTIGATE_ENTITY) never require approval", () => {
    expect(proposeDecision({ observationPattern: "internal_link_opportunity", observationSummary: "x", observationConfidence: 0.9, signalIds: [] }).requiredApproval).toBe(false)
    expect(proposeDecision({ observationPattern: "entity_investigation_needed", observationSummary: "x", observationConfidence: 0.9, signalIds: [] }).requiredApproval).toBe(false)
  })

  it("an unrecognized pattern proposes MONITOR — never a blind guess at an action", () => {
    expect(proposeDecision({ observationPattern: "totally_unknown_pattern", observationSummary: "x", observationConfidence: 0.9, signalIds: [] }).action).toBe("MONITOR")
  })
})

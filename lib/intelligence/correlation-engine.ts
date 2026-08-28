/* ================================================================== *
 * CORRELATION ENGINE (§3, ADR-032) — deterministic, rule-based
 * correlation of multiple real Signals into a real Observation. No LLM
 * involved (§3: "Não use apenas LLM para isso... first do deterministic/
 * rule-based correlation") — every rule is a real, named, testable
 * function over real signal types grouped by a real correlation key
 * (an entity or a page), never a fuzzy semantic match.
 * ================================================================== */

import type { Signal, SignalType } from "./signals"

export interface CorrelationRule {
  pattern: string
  /** every one of these types must be present in the group for the
   * rule to fire — a real AND, never an OR pretending to be an AND. */
  requiredTypes: SignalType[]
  /** types that strengthen confidence if present, but aren't required. */
  supportingTypes?: SignalType[]
  summarize: (signals: Signal[]) => string
}

export interface CorrelationResult {
  pattern: string
  correlationKey: string
  summary: string
  confidence: number
  signalIds: string[]
}

/** §3's two named examples, plus real rules over signal types this
 * codebase's Signal Engine actually emits (lib/intelligence/
 * signal-engine.ts) — every rule here has a real detector behind each
 * required type, never a rule waiting on a signal nothing emits. */
export const DEFAULT_CORRELATION_RULES: CorrelationRule[] = [
  {
    pattern: "high_value_opportunity",
    requiredTypes: ["ENTITY_GAP"],
    supportingTypes: ["TREND_ACCELERATION", "SEARCH_DEMAND_INCREASED", "query_emergence", "search_impression_spike"],
    summarize: (signals) => {
      const trend = signals.find((s) => s.type === "TREND_ACCELERATION")
      const entity = signals.find((s) => s.type === "ENTITY_GAP")
      return `A real coverage gap${entity ? ` (${entity.value.entityName ?? entity.entityId})` : ""} coincides with real rising demand${trend ? ` (trend acceleration ${trend.value.acceleration}%)` : ""} — a high-value opportunity worth researching.`
    },
  },
  {
    pattern: "content_decay_refresh",
    requiredTypes: ["PAGE_TRAFFIC_DECLINED", "PAGE_CTR_DECLINED"],
    supportingTypes: ["COMPETITOR_GAIN", "CONTENT_DECAY"],
    summarize: (signals) => {
      const traffic = signals.find((s) => s.type === "PAGE_TRAFFIC_DECLINED")
      const competitor = signals.find((s) => s.type === "COMPETITOR_GAIN")
      return `Real traffic decline (${traffic?.value.changePct ?? "?"}%) and CTR decline together${competitor ? `, alongside a competitor gaining visibility (${competitor.value.competitor})` : ""} — a real content-decay refresh candidate.`
    },
  },
  {
    pattern: "internal_link_opportunity",
    requiredTypes: ["INTERNAL_LINK_GAP"],
    supportingTypes: ["ENTITY_RELATIONSHIP_GAP"],
    summarize: (signals) => `A real page has fewer internal links than the minimum (${signals.find((s) => s.type === "INTERNAL_LINK_GAP")?.value.linkCount ?? "?"}) — a real internal-linking opportunity.`,
  },
  {
    pattern: "entity_investigation_needed",
    requiredTypes: ["ENTITY_RELATIONSHIP_GAP"],
    supportingTypes: ["ENTITY_GAP"],
    summarize: (signals) => `A real entity has zero known relationships${signals.some((s) => s.type === "ENTITY_GAP") ? " and zero evidence" : ""} — needs real investigation before it can support a page.`,
  },
  {
    pattern: "ai_visibility_shift",
    requiredTypes: ["AI_CITATION_LOSS"],
    supportingTypes: ["COMPETITOR_GAIN"],
    summarize: (signals) => `Real AI citation loss detected${signals.some((s) => s.type === "COMPETITOR_GAIN") ? ", alongside a competitor gaining AI visibility" : ""} — worth investigating what changed.`,
  },
]

/** `correlationKeyFor()` groups signals the same way the rest of this
 * module reasons about them — by entity when one exists, else by the
 * page a signal's value references, else the signal stands alone
 * (never force-correlated with an unrelated signal). */
export function correlationKeyFor(signal: Signal): string {
  if (signal.entityId) return `entity:${signal.entityId}`
  const pageId = signal.value?.pageId
  if (typeof pageId === "string") return `page:${pageId}`
  if (signal.marketId) return `market:${signal.marketId}`
  return `signal:${signal.id}`
}

/** Pure, deterministic: groups real signals by correlation key, then
 * checks each rule's requiredTypes against each group. A rule fires
 * once per group per real match — confidence is the group's own
 * signals' average confidence, boosted (capped at 0.95) for each real
 * supporting type also present, never a fixed/fabricated number. */
export function correlateSignals(signals: Signal[], rules: CorrelationRule[] = DEFAULT_CORRELATION_RULES): CorrelationResult[] {
  const groups = new Map<string, Signal[]>()
  for (const signal of signals) {
    const key = correlationKeyFor(signal)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(signal)
  }

  const results: CorrelationResult[] = []
  for (const [key, group] of groups) {
    const presentTypes = new Set(group.map((s) => s.type))
    for (const rule of rules) {
      const hasAllRequired = rule.requiredTypes.every((t) => presentTypes.has(t))
      if (!hasAllRequired) continue
      const matchingSignals = group.filter((s) => rule.requiredTypes.includes(s.type) || rule.supportingTypes?.includes(s.type))
      const supportingCount = rule.supportingTypes?.filter((t) => presentTypes.has(t)).length ?? 0
      const baseConfidence = matchingSignals.reduce((sum, s) => sum + s.confidence, 0) / matchingSignals.length
      const confidence = Math.min(0.95, baseConfidence + supportingCount * 0.05)
      results.push({ pattern: rule.pattern, correlationKey: key, summary: rule.summarize(matchingSignals), confidence, signalIds: matchingSignals.map((s) => s.id) })
    }
  }
  return results
}

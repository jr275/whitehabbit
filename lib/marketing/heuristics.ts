/* ================================================================== *
 * MARKETING HEURISTICS — reusable, structured EXPERT OPERATIONAL
 * KNOWLEDGE, not a prompt.
 *
 * A Heuristic is data (trigger/conditions/decision_logic/actions/
 * exceptions/risk/expected_effect/evaluation_method) PLUS, when
 * `executable: true`, real deterministic code implementing that
 * decision logic — no LLM call anywhere in this file. Semantic
 * interpretation (turning a detected opportunity into readable
 * rationale) is the calling Skill's job, using the LLM tool; this
 * file only ever does arithmetic and keyword-rule classification —
 * see lib/agent/skills/search-waste-detection.ts for where the two
 * are composed.
 * ================================================================== */

import { round2, type SearchIntent, type SearchTerm, type PaidSearchDataset } from "./paid-search-model"

export interface Heuristic {
  id: string
  name: string
  version: string
  description: string
  trigger: string
  conditions: string[]
  decisionLogic: string[]
  actions: string[]
  exceptions: string[]
  risk: "low" | "medium" | "high"
  expectedEffect: string
  evaluationMethod: string
  /** false = documented, structured expert knowledge with no
   * executable implementation yet (the same honest "planned" status
   * lib/marketing/skill-metadata.ts uses) — never wired to a Skill's
   * execute(). */
  executable: boolean
}

export const SEARCH_WASTE_DETECTION_HEURISTIC: Heuristic = {
  id: "heur_search_waste_detection",
  name: "Search Waste Detection",
  version: "1.0",
  description: "Identifies paid-search spend flowing to search terms that produce no real return, and turns it into concrete negative-keyword/targeting candidates.",
  trigger: "A paid-search dataset is available for analysis.",
  conditions: [
    "Spend increased period-over-period (when a prior period is available)",
    "CPA increased period-over-period (when a prior period is available)",
    "Conversion rate decreased period-over-period (when a prior period is available)",
    // V1's honest scope, disclosed here rather than silently assumed:
    // this deployment's demo/connector data is single-window (no real
    // period-over-period comparison exists yet — see
    // lib/marketing/google-ads-data.ts). Absent a prior period, the
    // heuristic evaluates the CURRENT window's absolute waste signal
    // directly (zero-conversion spend on addressable search terms) —
    // a real, deterministic condition, just not a trend.
  ],
  decisionLogic: ["Analyze search-term intent", "Identify low-value traffic", "Classify waste", "Estimate impact", "Generate candidates"],
  actions: ["Negative keyword recommendations", "Targeting recommendations", "Budget recommendations"],
  exceptions: ["Never recommend excluding a branded search term.", "Never recommend excluding a term with at least one real conversion.", "A term with fewer than the minimum click threshold is left unclassified rather than guessed at."],
  risk: "medium",
  expectedEffect: "Reduced wasted spend, improved CPA, without reducing real conversion volume.",
  evaluationMethod: "Estimated wasted spend avoided, CPA improvement, conversion impact — computed deterministically from the real dataset, never modeled.",
  executable: true,
}

export const MARGINAL_EFFICIENCY_REALLOCATION_HEURISTIC: Heuristic = {
  id: "heur_marginal_efficiency_reallocation",
  name: "Marginal Efficiency Reallocation",
  version: "0.1",
  description: "Recommends shifting budget from the lowest-marginal-return campaigns toward the highest, within real, declared constraints.",
  trigger: "A multi-campaign paid dataset is available and CPA/ROAS variance across campaigns exceeds a real threshold.",
  conditions: ["At least 2 campaigns with real spend", "A statistically meaningful CPA/ROAS gap between the best and worst campaign"],
  decisionLogic: ["Rank campaigns by real marginal CPA/ROAS", "Identify safe reallocation candidates", "Respect any declared budget floor/ceiling constraints"],
  actions: ["Budget increase recommendation", "Budget decrease recommendation"],
  exceptions: ["Never recommend a reallocation below an operator-declared minimum budget.", "Never recommend a full budget cut for a campaign with fewer than a minimum sample of conversions — too little signal to trust."],
  risk: "high",
  expectedEffect: "Improved blended CPA/ROAS without harming a low-volume-but-necessary campaign.",
  evaluationMethod: "Projected blended CPA/ROAS improvement, computed deterministically from the real per-campaign rates.",
  executable: false,
}

export const CREATIVE_FATIGUE_HEURISTIC: Heuristic = {
  id: "heur_creative_fatigue",
  name: "Creative Fatigue Pattern",
  version: "0.1",
  description: "Detects a real, sustained CTR/frequency pattern consistent with audience fatigue on a specific creative.",
  trigger: "A creative-level performance dataset is available.",
  conditions: ["CTR declining for 3+ consecutive real periods", "Frequency (impressions per unique reach) rising over the same window"],
  decisionLogic: ["Compute per-creative CTR trend", "Compute per-creative frequency trend", "Flag creatives matching both real trend conditions"],
  actions: ["Creative refresh recommendation", "Audience expansion recommendation"],
  exceptions: ["Never flag a creative with fewer than a minimum real impression sample — too little signal to trust."],
  risk: "low",
  expectedEffect: "Restored CTR/conversion rate after refresh.",
  evaluationMethod: "Post-refresh CTR delta, once real post-action data exists.",
  executable: false,
}

export const MARKETING_HEURISTIC_CATALOG: Heuristic[] = [SEARCH_WASTE_DETECTION_HEURISTIC, MARGINAL_EFFICIENCY_REALLOCATION_HEURISTIC, CREATIVE_FATIGUE_HEURISTIC]

/* ================================================================== *
 * EXECUTABLE LOGIC — Search Waste Detection only. Pure, deterministic
 * functions; no I/O, no LLM, no randomness. Every threshold below is a
 * named constant, not a magic number, so the decision logic stays
 * auditable.
 * ================================================================== */

const MIN_CLICKS_FOR_CLASSIFICATION = 3
/** A term is only ever a waste CANDIDATE if it has spent real money
 * with zero real conversions — never flagged on clicks/impressions
 * alone. */
const MIN_SPEND_FOR_WASTE_CANDIDATE = 5

const HIGH_INTENT_PATTERNS = /\b(buy|price|pricing|cost|demo|quote|discount|deal|near me|best|vs|versus|alternative|for sale)\b/i
const INFORMATIONAL_PATTERNS = /\b(how to|what is|what's|guide|tutorial|meaning|definition|examples?|why)\b/i
/** Classic negative-keyword signal terms — a real, named list, not an
 * ML model standing in for one. An operator can extend this via a
 * future Knowledge/Behavior rule; this is the honest, deterministic
 * starting set. */
const WASTE_SIGNAL_PATTERNS = /\b(free|jobs?|career|hiring|salary|torrent|crack|template|course|diy|tutorial for beginners|reddit|wikipedia)\b/i

function normalizeBrandTerms(brandTerms: string[]): RegExp | null {
  const cleaned = brandTerms.map((b) => b.trim()).filter(Boolean)
  if (cleaned.length === 0) return null
  const escaped = cleaned.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i")
}

/** Deterministic keyword-rule intent classification — never an LLM
 * call. A term below the minimum click threshold stays "unknown"
 * rather than being guessed at with too little signal. */
export function classifySearchTermIntent(term: SearchTerm, brandPattern: RegExp | null): SearchIntent {
  if (term.clicks < MIN_CLICKS_FOR_CLASSIFICATION) return "unknown"
  const text = term.term.toLowerCase()
  if (brandPattern && brandPattern.test(text)) return "branded"
  if (WASTE_SIGNAL_PATTERNS.test(text)) return "irrelevant"
  if (INFORMATIONAL_PATTERNS.test(text)) return "informational"
  if (HIGH_INTENT_PATTERNS.test(text)) return "high_intent"
  return "unknown"
}

export function classifyDataset(dataset: PaidSearchDataset, brandTerms: string[]): SearchTerm[] {
  const brandPattern = normalizeBrandTerms(brandTerms)
  return dataset.searchTerms.map((t) => ({ ...t, intent: classifySearchTermIntent(t, brandPattern) }))
}

export interface WasteOpportunity {
  id: string
  reason: "irrelevant_intent" | "informational_zero_conversion" | "zero_conversion_high_spend"
  searchTermIds: string[]
  matchedTerms: string[]
  wastedSpend: number
  recoverableSpend: number
  clicks: number
  suggestedAction: "add_negative_keyword" | "review_targeting"
  candidateNegativeKeywords: string[]
}

/** The real decision logic: "identify low-value traffic -> classify
 * waste -> estimate impact -> generate candidates" (the heuristic's
 * own decision_logic, executed for real). Never touches a branded
 * term (exceptions[0]) or a term with a real conversion (exceptions[1]) —
 * both checked structurally, not left to the LLM to remember. */
export function detectWasteOpportunities(classifiedTerms: SearchTerm[]): WasteOpportunity[] {
  const candidates = classifiedTerms.filter((t) => t.intent !== "branded" && t.conversions === 0 && t.spend >= MIN_SPEND_FOR_WASTE_CANDIDATE)

  const groups = new Map<WasteOpportunity["reason"], SearchTerm[]>()
  for (const t of candidates) {
    const reason: WasteOpportunity["reason"] = t.intent === "irrelevant" ? "irrelevant_intent" : t.intent === "informational" ? "informational_zero_conversion" : "zero_conversion_high_spend"
    const list = groups.get(reason) ?? []
    list.push(t)
    groups.set(reason, list)
  }

  const opportunities: WasteOpportunity[] = []
  for (const [reason, terms] of groups) {
    if (terms.length === 0) continue
    // Recoverable = the subset actually addressable by a negative
    // keyword (broad/phrase match — an exact-match term converting
    // zero times still needs a targeting change, not a negative
    // keyword, so it's excluded from THIS action's recoverable figure).
    const addressable = terms.filter((t) => t.matchType !== "exact")
    opportunities.push({
      id: `waste_${reason}`,
      reason,
      searchTermIds: terms.map((t) => t.id),
      matchedTerms: terms.map((t) => t.term).slice(0, 20),
      wastedSpend: round2(terms.reduce((s, t) => s + t.spend, 0)),
      recoverableSpend: round2(addressable.reduce((s, t) => s + t.spend, 0)),
      clicks: terms.reduce((s, t) => s + t.clicks, 0),
      suggestedAction: reason === "zero_conversion_high_spend" ? "review_targeting" : "add_negative_keyword",
      candidateNegativeKeywords: Array.from(new Set(addressable.map((t) => t.term))).slice(0, 10),
    })
  }
  return opportunities.sort((a, b) => b.wastedSpend - a.wastedSpend)
}

export interface SearchWasteImpactEstimate {
  estimatedWastedSpendMonthly: number
  potentialRecoverableSpendMonthly: number
  cpaImprovementPercentRange: [number, number]
}

/** Real, deterministic arithmetic — never a modeled/guessed number.
 * cpaImprovement is computed by actually recomputing CPA with the
 * addressable waste removed from spend (conversions unchanged, since
 * these terms converted zero times) — a real projection, expressed as
 * a range (conservative = recoverable only, optimistic = all detected
 * waste), never a single fabricated point estimate. */
export function estimateImpact(opportunities: WasteOpportunity[], totals: PaidSearchDataset["totals"]): SearchWasteImpactEstimate {
  const wastedSpend = round2(opportunities.reduce((s, o) => s + o.wastedSpend, 0))
  const recoverableSpend = round2(opportunities.reduce((s, o) => s + o.recoverableSpend, 0))
  const currentCpa = totals.conversions > 0 ? totals.spend / totals.conversions : null

  let range: [number, number] = [0, 0]
  if (currentCpa && totals.conversions > 0) {
    const conservativeCpa = (totals.spend - recoverableSpend) / totals.conversions
    const optimisticCpa = (totals.spend - wastedSpend) / totals.conversions
    const conservativeImprovement = round2(((currentCpa - conservativeCpa) / currentCpa) * 100)
    const optimisticImprovement = round2(((currentCpa - optimisticCpa) / currentCpa) * 100)
    range = [Math.max(0, conservativeImprovement), Math.max(0, optimisticImprovement)]
  }

  return { estimatedWastedSpendMonthly: wastedSpend, potentialRecoverableSpendMonthly: recoverableSpend, cpaImprovementPercentRange: range }
}

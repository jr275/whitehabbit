/* ================================================================== *
 * OPPORTUNITY ENGINE — TREND != OPPORTUNITY (section 5).
 *
 * scoreOpportunity() is a pure, deterministic function: one real
 * IntelligenceSignal (the LLM's own structural read of real search
 * results — see cultural-intelligence.ts) plus this worker's own real
 * brand/audience grounding text (its mission, objectives, and
 * retrieved Domain Profile knowledge — the exact same real grounding
 * every other skill already uses via lib/agent/knowledge.ts) in,
 * one scored CreativeOpportunity out. No LLM call happens here — the
 * relevance scoring is the same honest keyword-overlap approach
 * lib/agent/knowledge.ts's retrieveRelevantKnowledge() already uses,
 * so "why this brand" / "why this audience" is always a real,
 * reproducible number, never a second invented LLM opinion.
 *
 * A signal can score `status: "rejected"` — the explicit case in the
 * brief: high trend velocity + low brand relevance = do not create.
 * ================================================================== */

import type { CreativeOpportunity, IntelligenceSignal } from "./model"

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

/** Real overlap between a signal's own real text and this worker's
 * real grounding text — 0-100, never fabricated. */
function overlapScore(signalText: string, groundingText: string): number {
  const signalTerms = new Set(tokenize(signalText))
  const groundingTerms = new Set(tokenize(groundingText))
  if (signalTerms.size === 0 || groundingTerms.size === 0) return 0
  let hits = 0
  for (const t of signalTerms) if (groundingTerms.has(t)) hits++
  return Math.round((hits / signalTerms.size) * 100)
}

const REJECT_VELOCITY_THRESHOLD = 70
const REJECT_BRAND_RELEVANCE_THRESHOLD = 20

export function scoreOpportunity(signal: IntelligenceSignal, brandContext: string, audienceContext: string): CreativeOpportunity {
  const signalText = `${signal.topic} ${signal.category}`
  const brandRelevance = overlapScore(signalText, brandContext)
  const audienceRelevance = overlapScore(signalText, audienceContext || brandContext)
  const creativePotential = Math.round((signal.novelty + signal.trendScore) / 2)
  // No real competitive-intelligence source is connected — 0 is the
  // honest "unknown", never a guessed saturation level.
  const competitiveSaturation = 0
  // A real, deterministic rule off the model's own real sentiment
  // read — negative sentiment raises real brand-safety risk.
  const safetyRisk = signal.sentiment < -40 ? 60 : signal.sentiment < -10 ? 30 : 10
  const expirationProbability = Math.min(100, signal.acceleration)
  const estimatedHalfLifeHours = Math.max(6, Math.round(200 - signal.velocity * 1.5))

  const opportunityScore = Math.round(brandRelevance * 0.35 + audienceRelevance * 0.25 + creativePotential * 0.25 + signal.confidence * 0.15)

  const reject = signal.velocity >= REJECT_VELOCITY_THRESHOLD && brandRelevance < REJECT_BRAND_RELEVANCE_THRESHOLD
  const status: CreativeOpportunity["status"] = reject ? "rejected" : "open"
  const rationale = reject
    ? `Trend velocity is high (${signal.velocity}/100) but brand relevance is low (${brandRelevance}/100) — high velocity alone is not a reason to create.`
    : `Velocity ${signal.velocity}/100, brand relevance ${brandRelevance}/100, audience relevance ${audienceRelevance}/100 — a real, brand-relevant opportunity worth developing now.`
  const recommendedAction = reject ? "Do not create — monitor only." : "Generate creative territories for this opportunity."

  return {
    id: `opp_${signal.id}`,
    signalIds: [signal.id],
    topic: signal.topic,
    detectedAt: Date.now(),
    trendVelocity: signal.velocity,
    trendAcceleration: signal.acceleration,
    audienceRelevance,
    brandRelevance,
    creativePotential,
    novelty: signal.novelty,
    competitiveSaturation,
    safetyRisk,
    expirationProbability,
    estimatedHalfLifeHours,
    opportunityScore,
    rationale,
    recommendedAction,
    status,
  }
}

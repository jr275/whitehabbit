/* ================================================================== *
 * TREND ENGINE (§15-16, ADR-026) — pure, deterministic detection over
 * real time-series data. No pretending every movement is a trend:
 * configurable thresholds, and a real minimum-volume floor so a swing
 * from "1 observation" to "2 observations" never reports as a "+100%"
 * breaking trend.
 * ================================================================== */

import type { TrendState } from "./trends"

export interface TrendWindowPoint {
  /** the period this point covers, e.g. a date or week label — used
   * only for the caller's own bookkeeping, not by the math below. */
  period: string
  /** the real observed volume for this point (e.g. impressions, clicks,
   * or a raw count) — never a percentage or already-derived value. */
  volume: number
}

export interface TrendThresholds {
  /** minimum real observed volume in the recent window before a trend
   * is reported at all — below this, the movement is noise, not a
   * trend (§15: "do not pretend every movement is a trend"). */
  minVolume: number
  risingVelocityPct: number
  breakingVelocityPct: number
  decliningVelocityPct: number
  stableVelocityBandPct: number
}

export const DEFAULT_TREND_THRESHOLDS: TrendThresholds = {
  minVolume: 10,
  risingVelocityPct: 30,
  breakingVelocityPct: 100,
  decliningVelocityPct: -20,
  stableVelocityBandPct: 10,
}

export interface TrendDetectionResult {
  state: TrendState
  velocity: number
  acceleration: number | null
  momentum: number
  confidence: number
  reasons: string[]
}

/** `points` must be in chronological order, oldest first, one point per
 * comparable period (e.g. one per week). Needs at least 2 points to
 * compute a velocity, and 3 to compute acceleration — returns a real,
 * low-confidence "stable" (never a fabricated direction) if there isn't
 * enough history yet. */
export function detectTrend(points: TrendWindowPoint[], thresholds: TrendThresholds = DEFAULT_TREND_THRESHOLDS): TrendDetectionResult {
  const reasons: string[] = []
  if (points.length < 2) {
    return { state: "stable", velocity: 0, acceleration: null, momentum: 0, confidence: 0, reasons: ["Not enough historical data to detect a trend (need at least 2 periods)."] }
  }

  const recent = points[points.length - 1]
  const prior = points[points.length - 2]
  const velocity = prior.volume > 0 ? ((recent.volume - prior.volume) / prior.volume) * 100 : recent.volume > 0 ? 100 : 0

  let acceleration: number | null = null
  if (points.length >= 3) {
    const priorPrior = points[points.length - 3]
    const priorVelocity = priorPrior.volume > 0 ? ((prior.volume - priorPrior.volume) / priorPrior.volume) * 100 : prior.volume > 0 ? 100 : 0
    acceleration = velocity - priorVelocity
  }

  // momentum: velocity weighted by real observed volume — a 100% swing
  // on 2 observations is real noise; the same swing on 10,000 carries
  // real weight. log-dampened so momentum doesn't scale linearly with
  // huge volumes either.
  const momentum = velocity * Math.log10(10 + recent.volume)

  if (recent.volume < thresholds.minVolume) {
    reasons.push(`Recent volume (${recent.volume}) is below the minimum (${thresholds.minVolume}) required to report a trend, not noise.`)
    return { state: "stable", velocity, acceleration, momentum, confidence: 0.2, reasons }
  }

  let state: TrendState
  let confidence: number
  if (prior.volume === 0 && recent.volume >= thresholds.minVolume) {
    state = "emerging"
    confidence = 0.6
    reasons.push(`No prior observations, but ${recent.volume} real observations this period — a genuinely new signal, not yet enough history to classify further.`)
  } else if (velocity >= thresholds.breakingVelocityPct) {
    state = "breaking"
    confidence = 0.85
    reasons.push(`Velocity +${velocity.toFixed(1)}% exceeds the breaking threshold (${thresholds.breakingVelocityPct}%).`)
  } else if (velocity >= thresholds.risingVelocityPct) {
    state = "rising"
    confidence = 0.75
    reasons.push(`Velocity +${velocity.toFixed(1)}% exceeds the rising threshold (${thresholds.risingVelocityPct}%).`)
  } else if (velocity <= thresholds.decliningVelocityPct) {
    state = "declining"
    confidence = 0.75
    reasons.push(`Velocity ${velocity.toFixed(1)}% is below the declining threshold (${thresholds.decliningVelocityPct}%).`)
  } else if (Math.abs(velocity) <= thresholds.stableVelocityBandPct) {
    state = "stable"
    confidence = 0.7
    reasons.push(`Velocity ${velocity.toFixed(1)}% is within the stable band (±${thresholds.stableVelocityBandPct}%).`)
  } else {
    // between the stable band and rising/declining thresholds — a real,
    // honest "not confident enough to call a direction" state, still
    // reported as stable but with lower confidence than a real stable read.
    state = "stable"
    confidence = 0.4
    reasons.push(`Velocity ${velocity.toFixed(1)}% is between the stable band and the rising/declining thresholds — reported as stable with reduced confidence.`)
  }

  return { state, velocity, acceleration, momentum, confidence, reasons }
}

import "server-only"

/* ================================================================== *
 * SEARCH PERFORMANCE SIGNALS (§14) — real, deterministic detection
 * over real search_console_snapshots/search_query_observations rows.
 * Every detector compares real week-over-week (or period-over-period)
 * numbers against a real, named threshold — never a fabricated
 * anomaly. A property with fewer than two comparable periods simply
 * produces no signals (honest "not enough data yet").
 * ================================================================== */

import { recordSignal } from "../signals"
import { listSnapshots, listQueryObservations, listPageObservations, type SearchConsoleSnapshot } from "./repo"

export interface DetectionThresholds {
  spikePct: number
  declinePct: number
  ctrAnomalyRatio: number // observed CTR vs. expected-for-position ratio
  highImpressionFloor: number
  lowCtrCeiling: number
  highCtrFloor: number
  lowPositionFloor: number // "low position" here means a WORSE (higher) rank number
}

export const DEFAULT_DETECTION_THRESHOLDS: DetectionThresholds = {
  spikePct: 50,
  declinePct: -30,
  ctrAnomalyRatio: 0.5,
  highImpressionFloor: 500,
  lowCtrCeiling: 0.02,
  highCtrFloor: 0.15,
  lowPositionFloor: 15,
}

/** A real, published-style CTR-by-position curve (organic search
 * benchmark shape — position 1 gets far more clicks per impression
 * than position 10) used only as an EXPECTED baseline for anomaly
 * detection, never presented as a measured fact about this tenant. */
function expectedCtrForPosition(position: number): number {
  if (position <= 1) return 0.28
  if (position <= 3) return 0.15
  if (position <= 5) return 0.08
  if (position <= 10) return 0.03
  return 0.01
}

function pctChange(recent: number, prior: number): number {
  if (prior === 0) return recent > 0 ? 100 : 0
  return ((recent - prior) / prior) * 100
}

export async function detectSearchPerformanceSignals(orgId: string, projectId: string, propertyId: string, thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS): Promise<number> {
  let signalCount = 0

  // ---- property-level: impression/click spikes, position drift ------
  const snapshots = await listSnapshots(propertyId, orgId, 30)
  if (snapshots.length >= 2) {
    const recent = snapshots[snapshots.length - 1]
    const prior = snapshots[snapshots.length - 2]
    signalCount += await maybeSpike(orgId, projectId, "search_impression_spike", recent, prior, "impressions", thresholds)
    signalCount += await maybeSpike(orgId, projectId, "search_click_spike", recent, prior, "clicks", thresholds)

    const positionDelta = prior.position - recent.position // positive = improvement (rank number went down)
    if (recent.impressions >= thresholds.highImpressionFloor) {
      if (positionDelta >= 2) {
        await recordSignal({ orgId, projectId, sourceId: propertyId, type: "position_improvement", value: { from: prior.position, to: recent.position, delta: positionDelta }, source: "search_console_detector", confidence: 0.8 })
        signalCount += 1
      } else if (positionDelta <= -2) {
        await recordSignal({ orgId, projectId, sourceId: propertyId, type: "position_decline", value: { from: prior.position, to: recent.position, delta: positionDelta }, source: "search_console_detector", confidence: 0.8 })
        signalCount += 1
      }
    }

    if (recent.impressions >= thresholds.highImpressionFloor && recent.ctr < thresholds.lowCtrCeiling) {
      await recordSignal({ orgId, projectId, sourceId: propertyId, type: "high_impression_low_ctr", value: { impressions: recent.impressions, ctr: recent.ctr }, source: "search_console_detector", confidence: 0.75 })
      signalCount += 1
    }
    if (recent.ctr >= thresholds.highCtrFloor && recent.position >= thresholds.lowPositionFloor) {
      await recordSignal({ orgId, projectId, sourceId: propertyId, type: "high_ctr_low_position", value: { ctr: recent.ctr, position: recent.position }, source: "search_console_detector", confidence: 0.75 })
      signalCount += 1
    }

    const expected = expectedCtrForPosition(recent.position)
    if (expected > 0 && recent.ctr / expected < thresholds.ctrAnomalyRatio && recent.impressions >= thresholds.highImpressionFloor) {
      await recordSignal({ orgId, projectId, sourceId: propertyId, type: "ctr_anomaly", value: { observedCtr: recent.ctr, expectedCtr: expected, position: recent.position }, source: "search_console_detector", confidence: 0.65 })
      signalCount += 1
    }
  }

  // ---- query-level: emergence/decay ----------------------------------
  const queryObs = await listQueryObservations(propertyId, orgId, { limit: 1000 })
  const byQuery = new Map<string, { date: string; impressions: number }[]>()
  for (const obs of queryObs) {
    if (!byQuery.has(obs.query)) byQuery.set(obs.query, [])
    byQuery.get(obs.query)!.push({ date: obs.date, impressions: obs.impressions })
  }
  for (const [queryText, points] of byQuery) {
    points.sort((a, b) => a.date.localeCompare(b.date))
    if (points.length < 2) continue
    const recent = points[points.length - 1]
    const prior = points[points.length - 2]
    const change = pctChange(recent.impressions, prior.impressions)
    if (prior.impressions === 0 && recent.impressions >= 5) {
      await recordSignal({ orgId, projectId, sourceId: propertyId, type: "query_emergence", value: { query: queryText, impressions: recent.impressions }, source: "search_console_detector", confidence: 0.7 })
      signalCount += 1
    } else if (recent.impressions === 0 && prior.impressions >= 5) {
      await recordSignal({ orgId, projectId, sourceId: propertyId, type: "query_decay", value: { query: queryText, priorImpressions: prior.impressions }, source: "search_console_detector", confidence: 0.7 })
      signalCount += 1
    } else if (change <= thresholds.declinePct && prior.impressions >= thresholds.highImpressionFloor / 10) {
      await recordSignal({ orgId, projectId, sourceId: propertyId, type: "query_decay", value: { query: queryText, changePct: change }, source: "search_console_detector", confidence: 0.6 })
      signalCount += 1
    }
  }

  // ---- page-level: decay ---------------------------------------------
  const pageObs = await listPageObservations(propertyId, orgId, 1000)
  const byPage = new Map<string, { date: string; clicks: number }[]>()
  for (const obs of pageObs) {
    if (!byPage.has(obs.pageUrl)) byPage.set(obs.pageUrl, [])
    byPage.get(obs.pageUrl)!.push({ date: obs.date, clicks: obs.clicks })
  }
  for (const [pageUrl, points] of byPage) {
    points.sort((a, b) => a.date.localeCompare(b.date))
    if (points.length < 2) continue
    const recent = points[points.length - 1]
    const prior = points[points.length - 2]
    const change = pctChange(recent.clicks, prior.clicks)
    if (change <= thresholds.declinePct && prior.clicks > 0) {
      await recordSignal({ orgId, projectId, sourceId: propertyId, type: "page_decay", value: { pageUrl, changePct: change }, source: "search_console_detector", confidence: 0.65 })
      signalCount += 1
    }
  }

  return signalCount
}

async function maybeSpike(
  orgId: string,
  projectId: string,
  type: "search_impression_spike" | "search_click_spike",
  recent: SearchConsoleSnapshot,
  prior: SearchConsoleSnapshot,
  field: "impressions" | "clicks",
  thresholds: DetectionThresholds,
): Promise<number> {
  const change = pctChange(recent[field], prior[field])
  if (change >= thresholds.spikePct && prior[field] >= 1) {
    await recordSignal({ orgId, projectId, type, value: { from: prior[field], to: recent[field], changePct: change }, source: "search_console_detector", confidence: 0.75 })
    return 1
  }
  return 0
}

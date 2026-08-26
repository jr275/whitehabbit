import "server-only"

/* ================================================================== *
 * TREND SCAN (§15-16) — real orchestration: buckets real Search
 * Console observations into weekly windows, runs the deterministic
 * detector (lib/intelligence/trend-engine.ts) per query and site-wide,
 * persists real Trend rows, and spawns a real, linked Opportunity for
 * anything that clears the eligibility bar (lib/intelligence/
 * trend-opportunity.ts). A project with no Search Console data yet
 * produces zero trends — never a fabricated one.
 * ================================================================== */

import { listProperties, listSnapshots, listQueryObservations } from "./search-console/repo"
import { detectTrend, type TrendWindowPoint } from "./trend-engine"
import { upsertTrend } from "./trends"
import { createOpportunityFromTrend } from "./trend-opportunity"
import { recordSignal } from "./signals"

function isoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const target = new Date(d.getTime())
  target.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

function bucketByWeek(points: { date: string; volume: number }[]): TrendWindowPoint[] {
  const byWeek = new Map<string, number>()
  for (const p of points) byWeek.set(isoWeek(p.date), (byWeek.get(isoWeek(p.date)) ?? 0) + p.volume)
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, volume]) => ({ period, volume }))
}

export interface TrendScanResult {
  trendsDetected: number
  opportunitiesCreated: number
}

export async function runTrendScan(orgId: string, projectId: string): Promise<TrendScanResult> {
  let trendsDetected = 0
  let opportunitiesCreated = 0

  const properties = await listProperties(orgId, projectId)
  for (const property of properties) {
    // site-wide trend from real daily snapshots
    const snapshots = await listSnapshots(property.id, orgId, 180)
    if (snapshots.length >= 2) {
      const windows = bucketByWeek(snapshots.map((s) => ({ date: s.date, volume: s.impressions })))
      if (windows.length >= 2) {
        const detection = detectTrend(windows)
        const signal = await recordSignal({ orgId, projectId, sourceId: property.id, type: "manual", value: { detection }, source: "trend_scan", confidence: detection.confidence })
        const trend = await upsertTrend({ orgId, projectId, label: property.siteUrl, entityId: null, state: detection.state, velocity: detection.velocity, acceleration: detection.acceleration, momentum: detection.momentum, seasonality: null, confidence: detection.confidence, signalIds: [signal.id] })
        trendsDetected += 1
        const result = await createOpportunityFromTrend(orgId, projectId, trend)
        if (result.created) opportunitiesCreated += 1
      }
    }

    // per-query trends from real query observations
    const queryObs = await listQueryObservations(property.id, orgId, { limit: 2000 })
    const byQuery = new Map<string, { date: string; volume: number }[]>()
    for (const obs of queryObs) {
      if (!byQuery.has(obs.query)) byQuery.set(obs.query, [])
      byQuery.get(obs.query)!.push({ date: obs.date, volume: obs.impressions })
    }
    for (const [queryText, points] of byQuery) {
      const windows = bucketByWeek(points)
      if (windows.length < 2) continue
      const detection = detectTrend(windows)
      if (detection.confidence < 0.5) continue // not enough real signal to bother persisting a trend row
      const signal = await recordSignal({ orgId, projectId, sourceId: property.id, type: "manual", value: { query: queryText, detection }, source: "trend_scan", confidence: detection.confidence })
      const trend = await upsertTrend({ orgId, projectId, label: queryText, entityId: null, state: detection.state, velocity: detection.velocity, acceleration: detection.acceleration, momentum: detection.momentum, seasonality: null, confidence: detection.confidence, signalIds: [signal.id] })
      trendsDetected += 1
      const result = await createOpportunityFromTrend(orgId, projectId, trend)
      if (result.created) opportunitiesCreated += 1
    }
  }

  return { trendsDetected, opportunitiesCreated }
}

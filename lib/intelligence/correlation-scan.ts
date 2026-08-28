import "server-only"

/* Real orchestration for the Correlation Engine: reads a project's
 * recent real signals, runs the deterministic rules, and persists a
 * real IntelligenceObservation for each real match — idempotent by
 * (pattern, correlationKey): re-running the scan never creates a
 * second active observation for the same real correlation. */

import { listSignals } from "./signals"
import { queryOne } from "@/lib/db/client"
import { correlateSignals, DEFAULT_CORRELATION_RULES } from "./correlation-engine"
import { createObservation, type IntelligenceObservation } from "./observations"

const LOOKBACK_MS = 30 * 24 * 60 * 60_000 // 30 real days

export async function runCorrelationScan(orgId: string, projectId: string): Promise<IntelligenceObservation[]> {
  // real recent signals only — an old signal correlating with a fresh
  // one would be a false pattern (the old condition may no longer hold).
  const allTypes = [...new Set(DEFAULT_CORRELATION_RULES.flatMap((r) => [...r.requiredTypes, ...(r.supportingTypes ?? [])]))]
  const recentSignals = (await Promise.all(allTypes.map((type) => listSignals(orgId, projectId, { type, limit: 200 })))).flat().filter((s) => Date.now() - s.observedAt < LOOKBACK_MS)

  const matches = correlateSignals(recentSignals, DEFAULT_CORRELATION_RULES)
  const created: IntelligenceObservation[] = []
  for (const match of matches) {
    // dedup by (pattern, correlationKey), not by an exact signal_ids
    // match: comparing the serialized array was order-sensitive and a
    // real bug — Postgres gives no ORDER BY tiebreaker guarantee for
    // signals recorded within the same millisecond, so re-running the
    // scan could serialize the same real signal set in a different
    // order and fail to match. The same real correlation (same
    // pattern, same subject) is the same observation regardless of
    // exact signal ordering.
    const existing = await queryOne(
      "SELECT id FROM intelligence_observations WHERE org_id = $1 AND project_id = $2 AND pattern = $3 AND status = 'active' AND correlation_key = $4",
      [orgId, projectId, match.pattern, match.correlationKey],
    )
    if (existing) continue
    created.push(await createObservation({ orgId, projectId, pattern: match.pattern, summary: match.summary, signalIds: match.signalIds, confidence: match.confidence, correlationKey: match.correlationKey, expiresAt: Date.now() + LOOKBACK_MS }))
  }
  return created
}

export async function countRecentSignals(orgId: string, projectId: string): Promise<number> {
  const row = await queryOne<{ count: string }>("SELECT count(*) FROM signals WHERE org_id = $1 AND project_id = $2 AND observed_at >= $3", [orgId, projectId, Date.now() - LOOKBACK_MS])
  return Number(row?.count ?? 0)
}

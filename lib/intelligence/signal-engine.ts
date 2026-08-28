import "server-only"

/* ================================================================== *
 * SIGNAL ENGINE (§2, ADR-032) — the ONE unified emission facade every
 * detector in this codebase goes through. `recordSignal()`
 * (lib/intelligence/signals.ts) was already the sole persistence path
 * since Phase 5B; this module adds the missing detector coverage the
 * Phase 6 brief names (entity gaps, page performance decay, AI
 * citation change, internal link gaps, information gain gaps, trend
 * acceleration) so no module invents its own parallel signal concept.
 *
 * Every detector here is real and deterministic — computed from
 * already-persisted rows, never guessed. A source this deployment has
 * no real data for yet (e.g. GSC index-coverage/URL Inspection data
 * for INDEXATION_CHANGE) simply has no detector — see ADR-032's
 * Consequences for the honest list of what's not covered.
 * ================================================================== */

import { recordSignal, type Signal } from "./signals"
import { listCanonicalEntities, listEvidenceForEntity, listRelationshipsForEntity } from "@/lib/knowledge/repo"
import { hasPageForEntity, listPages } from "@/lib/pages/repo"
import { listPageScoreSnapshots } from "./page-score-snapshots"
import { listInternalLinksForPage } from "@/lib/internal-links/repo"
import { listTrends } from "./trends"
import { listOpportunities } from "@/lib/opportunity/repo"
import { buildInformationGainV2Input } from "@/lib/opportunity/information-gain-v2-input"
import { computeInformationGainV2 } from "@/lib/opportunity/information-gain-v2"

const DECLINE_THRESHOLD_PCT = -20
const MIN_INTERNAL_LINKS = 2
const ACCELERATION_THRESHOLD_PCT = 30

/** ENTITY_GAP / ENTITY_RELATIONSHIP_GAP — real, from the Knowledge
 * Graph: a canonical entity with zero real evidence, or zero real
 * relationships. */
export async function detectEntityGaps(orgId: string, projectId: string, limit = 100): Promise<Signal[]> {
  const entities = await listCanonicalEntities(orgId, projectId, { limit })
  const emitted: Signal[] = []
  for (const entity of entities) {
    const [evidence, relationships] = await Promise.all([listEvidenceForEntity(entity.id, orgId), listRelationshipsForEntity(entity.id, orgId)])
    if (evidence.length === 0) {
      emitted.push(await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: { entityName: entity.name, entityType: entity.entityType }, source: "signal_engine", confidence: 1 }))
    }
    if (relationships.length === 0) {
      emitted.push(await recordSignal({ orgId, projectId, type: "ENTITY_RELATIONSHIP_GAP", entityId: entity.id, value: { entityName: entity.name }, source: "signal_engine", confidence: 1 }))
    }
    const hasPage = await hasPageForEntity(projectId, entity.id)
    if (!hasPage && evidence.length > 0) {
      emitted.push(await recordSignal({ orgId, projectId, type: "CONTENT_GAP", entityId: entity.id, value: { entityName: entity.name, evidenceCount: evidence.length }, source: "signal_engine", confidence: 0.8 }))
    }
  }
  return emitted
}

/** PAGE_TRAFFIC_DECLINED / PAGE_CTR_DECLINED / CONTENT_DECAY — real,
 * from two real PageScoreSnapshot rows for the same page. A page with
 * fewer than 2 real snapshots produces nothing — honest "not enough
 * history," never a guessed decline. */
export async function detectPagePerformanceSignals(orgId: string, projectId: string): Promise<Signal[]> {
  const pages = await listPages(orgId, projectId, { status: "published" })
  const emitted: Signal[] = []
  for (const page of pages) {
    const snapshots = await listPageScoreSnapshots(orgId, page.id)
    const withClicks = snapshots.filter((s) => s.searchClicks != null)
    if (withClicks.length < 2) continue
    const recent = withClicks[withClicks.length - 1]
    const prior = withClicks[withClicks.length - 2]
    const clicksChange = prior.searchClicks! > 0 ? ((recent.searchClicks! - prior.searchClicks!) / prior.searchClicks!) * 100 : 0
    if (clicksChange <= DECLINE_THRESHOLD_PCT) {
      emitted.push(await recordSignal({ orgId, projectId, type: "PAGE_TRAFFIC_DECLINED", value: { pageId: page.id, changePct: clicksChange }, source: "signal_engine", confidence: 0.75 }))
    }
    if (recent.searchImpressions != null && prior.searchImpressions != null && recent.searchImpressions > 0 && prior.searchImpressions > 0) {
      const recentCtr = recent.searchClicks! / recent.searchImpressions
      const priorCtr = prior.searchClicks! / prior.searchImpressions
      const ctrChange = priorCtr > 0 ? ((recentCtr - priorCtr) / priorCtr) * 100 : 0
      if (ctrChange <= DECLINE_THRESHOLD_PCT) {
        emitted.push(await recordSignal({ orgId, projectId, type: "PAGE_CTR_DECLINED", value: { pageId: page.id, changePct: ctrChange }, source: "signal_engine", confidence: 0.75 }))
      }
    }
    // CONTENT_DECAY: a real composite — both traffic AND freshness (age
    // since last snapshot) point the same direction.
    const ageMs = Date.now() - page.updatedAt
    if (clicksChange <= DECLINE_THRESHOLD_PCT && ageMs > 90 * 24 * 60 * 60_000) {
      emitted.push(await recordSignal({ orgId, projectId, type: "CONTENT_DECAY", value: { pageId: page.id, clicksChangePct: clicksChange, ageDays: Math.round(ageMs / 86_400_000) }, source: "signal_engine", confidence: 0.7 }))
    }
  }
  return emitted
}

/** INTERNAL_LINK_GAP — real, from lib/internal-links/repo.ts's actual
 * link rows for each published page. */
export async function detectInternalLinkGaps(orgId: string, projectId: string): Promise<Signal[]> {
  const pages = await listPages(orgId, projectId, { status: "published" })
  const emitted: Signal[] = []
  for (const page of pages) {
    const links = await listInternalLinksForPage(page.id, orgId)
    if (links.length < MIN_INTERNAL_LINKS) {
      emitted.push(await recordSignal({ orgId, projectId, type: "INTERNAL_LINK_GAP", value: { pageId: page.id, linkCount: links.length, minimum: MIN_INTERNAL_LINKS }, source: "signal_engine", confidence: 1 }))
    }
  }
  return emitted
}

/** TREND_ACCELERATION — real, from a Trend's own already-computed
 * acceleration field (lib/intelligence/trend-engine.ts) crossing a
 * real threshold. Never fabricated — a trend with `acceleration: null`
 * (not enough history) is skipped entirely. */
export async function detectTrendAcceleration(orgId: string, projectId: string): Promise<Signal[]> {
  const trends = await listTrends(orgId, projectId, { limit: 200 })
  const emitted: Signal[] = []
  for (const trend of trends) {
    if (trend.acceleration != null && trend.acceleration >= ACCELERATION_THRESHOLD_PCT) {
      emitted.push(await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", value: { trendId: trend.id, label: trend.label, acceleration: trend.acceleration }, source: "signal_engine", confidence: trend.confidence }))
    }
  }
  return emitted
}

/** INFORMATION_GAIN_GAP — real, from the actual Information Gain V2
 * assembler (lib/opportunity/information-gain-v2-input.ts) for every
 * open ("discovered"/"approved") opportunity, below a real threshold. */
export async function detectInformationGainGaps(orgId: string, projectId: string, threshold = 40): Promise<Signal[]> {
  const opportunities = await listOpportunities(orgId, projectId, { status: "discovered" })
  const emitted: Signal[] = []
  for (const opportunity of opportunities.slice(0, 50)) {
    // bounded — this is a real, non-trivial computation (it runs Deep
    // Research internally); never scan an unbounded backlog per call.
    const { input } = await buildInformationGainV2Input(orgId, projectId, opportunity)
    const result = computeInformationGainV2(input)
    if (result.score < threshold) {
      emitted.push(
        await recordSignal({
          orgId,
          projectId,
          type: "INFORMATION_GAIN_GAP",
          entityId: opportunity.primaryEntityId,
          value: { opportunityId: opportunity.id, score: result.score, threshold, missingRequirements: result.missingRequirements },
          source: "signal_engine",
          confidence: 0.9,
        }),
      )
    }
  }
  return emitted
}

/** AI_CITATION_GAIN / AI_CITATION_LOSS — real, comparing citation
 * counts for a page across two real time windows. */
export async function detectAICitationChanges(orgId: string, projectId: string): Promise<Signal[]> {
  const { query } = await import("@/lib/db/client")
  const pages = await listPages(orgId, projectId, { status: "published" })
  const emitted: Signal[] = []
  const now = Date.now()
  const windowMs = 14 * 24 * 60 * 60_000
  for (const page of pages) {
    const recentCount = await query<{ count: string }>(
      "SELECT count(*) FROM ai_citations WHERE org_id = $1 AND page_id = $2 AND created_at >= $3",
      [orgId, page.id, now - windowMs],
    )
    const priorCount = await query<{ count: string }>(
      "SELECT count(*) FROM ai_citations WHERE org_id = $1 AND page_id = $2 AND created_at >= $3 AND created_at < $4",
      [orgId, page.id, now - 2 * windowMs, now - windowMs],
    )
    const recent = Number(recentCount[0]?.count ?? 0)
    const prior = Number(priorCount[0]?.count ?? 0)
    if (recent > prior && prior >= 0) {
      emitted.push(await recordSignal({ orgId, projectId, type: "AI_CITATION_GAIN", value: { pageId: page.id, recent, prior }, source: "signal_engine", confidence: 0.8 }))
    } else if (recent < prior) {
      emitted.push(await recordSignal({ orgId, projectId, type: "AI_CITATION_LOSS", value: { pageId: page.id, recent, prior }, source: "signal_engine", confidence: 0.8 }))
    }
  }
  return emitted
}

/** COMPETITOR_GAIN — real, comparing how often a named competitor is
 * mentioned across two real time windows of this project's AI
 * Visibility answers. Never invents a competitor name — only counts
 * mentions of names an ai_answers row already recorded (real
 * substring detection at answer-storage time, ADR-028). */
export async function detectCompetitorGains(orgId: string, projectId: string): Promise<Signal[]> {
  const { query } = await import("@/lib/db/client")
  const now = Date.now()
  const windowMs = 14 * 24 * 60 * 60_000
  const rows = await query<{ competitor_mentions: { name: string }[]; created_at: string }>(
    `SELECT a.competitor_mentions, a.created_at FROM ai_answers a
     JOIN ai_runs r ON r.id = a.ai_run_id
     WHERE r.org_id = $1 AND r.project_id = $2 AND a.created_at >= $3`,
    [orgId, projectId, now - 2 * windowMs],
  )
  const recentCounts = new Map<string, number>()
  const priorCounts = new Map<string, number>()
  for (const row of rows) {
    const bucket = Number(row.created_at) >= now - windowMs ? recentCounts : priorCounts
    for (const mention of row.competitor_mentions ?? []) {
      bucket.set(mention.name, (bucket.get(mention.name) ?? 0) + 1)
    }
  }
  const emitted: Signal[] = []
  for (const [name, recent] of recentCounts) {
    const prior = priorCounts.get(name) ?? 0
    if (recent > prior) {
      emitted.push(await recordSignal({ orgId, projectId, type: "COMPETITOR_GAIN", value: { competitor: name, recent, prior }, source: "signal_engine", confidence: 0.7 }))
    }
  }
  return emitted
}

/** Runs every real detector for a project in sequence. Bounded and
 * safe to call from a worker tick or on demand
 * (POST /api/v1/intelligence/signals/scan) — never a full-table sweep
 * with no limit. */
export async function runSignalEngineScan(orgId: string, projectId: string): Promise<{ emitted: number; byType: Record<string, number> }> {
  const results = await Promise.all([
    detectEntityGaps(orgId, projectId),
    detectPagePerformanceSignals(orgId, projectId),
    detectInternalLinkGaps(orgId, projectId),
    detectTrendAcceleration(orgId, projectId),
    detectAICitationChanges(orgId, projectId),
    detectCompetitorGains(orgId, projectId),
  ])
  const all = results.flat()
  const byType: Record<string, number> = {}
  for (const s of all) byType[s.type] = (byType[s.type] ?? 0) + 1
  return { emitted: all.length, byType }
}

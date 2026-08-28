import "server-only"

/* ================================================================== *
 * INTELLIGENCE TIMELINE (§8, ADR-032) — a real, event-based merge of
 * every stage in the Signal -> Observation -> Decision -> Action ->
 * Outcome chain for a project, chronological, each entry pointing back
 * at its real row. Never synthetic narrative text — every entry's
 * summary is built from the same real fields the resource's own detail
 * view shows.
 * ================================================================== */

import { listSignals } from "./signals"
import { listObservations } from "./observations"
import { listDecisions } from "./decisions"
import { listActions } from "./actions"
import { listOutcomes } from "./outcomes"

export type TimelineEntryType = "signal" | "observation" | "decision" | "action" | "outcome"

export interface TimelineEntry {
  type: TimelineEntryType
  id: string
  at: number
  summary: string
  detail: Record<string, unknown>
}

const ALL_TYPES: TimelineEntryType[] = ["signal", "observation", "decision", "action", "outcome"]

export interface TimelineFilters {
  /** Restrict to a subset of entry types — real server-side filtering:
   * a type left out of this set is never fetched at all, not fetched
   * then discarded (Phase 8 §12: "not naive client-side over unlimited
   * data"). Defaults to all five. */
  types?: TimelineEntryType[]
  entityId?: string
  /** inclusive lower/upper bound on `at` (epoch ms) */
  since?: number
  until?: number
  /** case-insensitive substring match against the entry's real
   * `summary` — the same text the resource's own detail view shows,
   * never a separate search index. */
  search?: string
  limit?: number
}

export async function buildIntelligenceTimeline(orgId: string, projectId: string, limitOrFilters: number | TimelineFilters = 100): Promise<TimelineEntry[]> {
  const filters: TimelineFilters = typeof limitOrFilters === "number" ? { limit: limitOrFilters } : limitOrFilters
  const limit = filters.limit ?? 100
  const types = new Set(filters.types && filters.types.length > 0 ? filters.types : ALL_TYPES)
  // Fetch a wider per-kind window than the final page size when a
  // search/date filter is active, since filtering happens after the
  // merge — still a bounded, server-side fetch, never the whole table.
  const perKindLimit = Math.min(filters.search || filters.since || filters.until ? Math.max(limit * 2, 200) : limit, 300)

  const [signals, observations, decisions, actions, outcomes] = await Promise.all([
    types.has("signal") ? listSignals(orgId, projectId, { limit: perKindLimit, entityId: filters.entityId }) : Promise.resolve([]),
    types.has("observation") ? listObservations(orgId, projectId, { limit: perKindLimit }) : Promise.resolve([]),
    types.has("decision") ? listDecisions(orgId, projectId, { limit: perKindLimit }) : Promise.resolve([]),
    types.has("action") ? listActions(orgId, projectId, { limit: perKindLimit }) : Promise.resolve([]),
    types.has("outcome") ? listOutcomes(orgId, projectId, perKindLimit) : Promise.resolve([]),
  ])

  let entries: TimelineEntry[] = [
    ...signals.map((s): TimelineEntry => ({ type: "signal", id: s.id, at: s.observedAt, summary: `${s.type} observed (confidence ${s.confidence.toFixed(2)})`, detail: { signalType: s.type, entityId: s.entityId, source: s.source } })),
    ...observations.map((o): TimelineEntry => ({ type: "observation", id: o.id, at: o.createdAt, summary: o.summary, detail: { pattern: o.pattern, signalCount: o.signalIds.length, status: o.status } })),
    ...decisions.map((d): TimelineEntry => ({ type: "decision", id: d.id, at: d.createdAt, summary: `${d.action}: ${d.reason}`, detail: { status: d.status, risk: d.risk, priority: d.priority, subjectType: d.subjectType, subjectId: d.subjectId } })),
    ...actions.map((a): TimelineEntry => ({ type: "action", id: a.id, at: a.startedAt ?? a.createdAt, summary: `Action ${a.status} for decision ${a.decisionId}`, detail: { decisionId: a.decisionId, agentRunId: a.agentRunId, status: a.status } })),
    ...outcomes.map((o): TimelineEntry => ({ type: "outcome", id: o.id, at: o.measuredAt, summary: `${o.metric}: ${o.value}${o.delta != null ? ` (Δ${o.delta >= 0 ? "+" : ""}${o.delta})` : ""}`, detail: { actionId: o.actionId, baseline: o.baseline, confidence: o.confidence } })),
  ]

  if (filters.since != null) entries = entries.filter((e) => e.at >= filters.since!)
  if (filters.until != null) entries = entries.filter((e) => e.at <= filters.until!)
  if (filters.search) {
    const needle = filters.search.toLowerCase()
    entries = entries.filter((e) => e.summary.toLowerCase().includes(needle) || e.id.toLowerCase().includes(needle))
  }
  if (filters.entityId) {
    // signals already fetched entity-scoped from the DB; this also
    // catches an entityId recorded in another kind's own detail.
    entries = entries.filter((e) => e.type === "signal" || e.detail.entityId === filters.entityId)
  }

  entries.sort((a, b) => b.at - a.at)
  return entries.slice(0, Math.min(limit, 300))
}

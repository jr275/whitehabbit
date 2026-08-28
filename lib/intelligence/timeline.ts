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

export async function buildIntelligenceTimeline(orgId: string, projectId: string, limit = 100): Promise<TimelineEntry[]> {
  const perKindLimit = Math.min(limit, 200)
  const [signals, observations, decisions, actions, outcomes] = await Promise.all([
    listSignals(orgId, projectId, { limit: perKindLimit }),
    listObservations(orgId, projectId, { limit: perKindLimit }),
    listDecisions(orgId, projectId, { limit: perKindLimit }),
    listActions(orgId, projectId, { limit: perKindLimit }),
    listOutcomes(orgId, projectId, perKindLimit),
  ])

  const entries: TimelineEntry[] = [
    ...signals.map((s): TimelineEntry => ({ type: "signal", id: s.id, at: s.observedAt, summary: `${s.type} observed (confidence ${s.confidence.toFixed(2)})`, detail: { signalType: s.type, entityId: s.entityId, source: s.source } })),
    ...observations.map((o): TimelineEntry => ({ type: "observation", id: o.id, at: o.createdAt, summary: o.summary, detail: { pattern: o.pattern, signalCount: o.signalIds.length, status: o.status } })),
    ...decisions.map((d): TimelineEntry => ({ type: "decision", id: d.id, at: d.createdAt, summary: `${d.action}: ${d.reason}`, detail: { status: d.status, risk: d.risk, priority: d.priority, subjectType: d.subjectType, subjectId: d.subjectId } })),
    ...actions.map((a): TimelineEntry => ({ type: "action", id: a.id, at: a.startedAt ?? a.createdAt, summary: `Action ${a.status} for decision ${a.decisionId}`, detail: { decisionId: a.decisionId, agentRunId: a.agentRunId, status: a.status } })),
    ...outcomes.map((o): TimelineEntry => ({ type: "outcome", id: o.id, at: o.measuredAt, summary: `${o.metric}: ${o.value}${o.delta != null ? ` (Δ${o.delta >= 0 ? "+" : ""}${o.delta})` : ""}`, detail: { actionId: o.actionId, baseline: o.baseline, confidence: o.confidence } })),
  ]

  entries.sort((a, b) => b.at - a.at)
  return entries.slice(0, Math.min(limit, 300))
}

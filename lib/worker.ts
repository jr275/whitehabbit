"use client"

import { useEffect, useRef, useState } from "react"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — REAL STATE
 * The factual record of what the worker actually does.
 * Every VISUAL STATE (pulse, particle, glow) must trace back to one
 * of these events. No animation without an event behind it.
 * ------------------------------------------------------------------ */

export type CapabilityId =
  | "research"
  | "reasoning"
  | "communication"
  | "execution"
  | "reliability"

export type EventKind =
  | "task_started"
  | "skill_invoked"
  | "tool_called"
  | "decision_created"
  | "action_executed"
  | "task_completed"

export interface WorkerEvent {
  id: number
  t: number // ms epoch
  kind: EventKind
  capability: CapabilityId
  label: string
  detail?: string
}

export interface Capability {
  id: CapabilityId
  name: string
  /** health / mastery, 0-100 */
  score: number
  /** the worker's weakest link surfaces this */
  warning?: boolean
}

export interface Worker {
  name: string
  role: string
  level: number
  xp: number // 0-100 toward next level
  status: "working" | "idle"
  capabilities: Capability[]
}

export const WORKER: Worker = {
  name: "Atlas",
  role: "Sales Worker",
  level: 12,
  xp: 68,
  status: "working",
  capabilities: [
    { id: "research", name: "Research", score: 94 },
    { id: "reasoning", name: "Reasoning", score: 87 },
    { id: "communication", name: "Communication", score: 73, warning: true },
    { id: "execution", name: "Execution", score: 96 },
    { id: "reliability", name: "Reliability", score: 98 },
  ],
}

export const CAPABILITY_ORDER: CapabilityId[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
  "reliability",
]

/* The eight-beat emotional loop — the worker is never "done". */
export const LOOP = [
  { id: "create", label: "Create", hint: "Give it purpose" },
  { id: "grow", label: "Grow", hint: "Give it capabilities" },
  { id: "teach", label: "Teach", hint: "Shape its behavior" },
  { id: "test", label: "Test", hint: "Challenge it" },
  { id: "release", label: "Release", hint: "Let it work" },
  { id: "watch", label: "Watch", hint: "See it in action" },
  { id: "trace", label: "Trace", hint: "Understand what happened" },
  { id: "evolve", label: "Evolve", hint: "Make it better" },
] as const

export type LoopId = (typeof LOOP)[number]["id"]

/* Plausible real-execution scripts, one per capability. */
const SCRIPTS: Record<CapabilityId, { kind: EventKind; label: string; detail?: string }[]> = {
  research: [
    { kind: "task_started", label: "SCAN_ICP", detail: "Segment: mid-market SaaS" },
    { kind: "tool_called", label: "WEB_SEARCH", detail: 'q="Series B fintech hiring RevOps"' },
    { kind: "tool_called", label: "SOURCE_RETRIEVED", detail: "12 signals · 3 verified" },
    { kind: "skill_invoked", label: "EVIDENCE_EXTRACTED", detail: "Funding + headcount delta" },
  ],
  reasoning: [
    { kind: "skill_invoked", label: "SCORE_INTENT", detail: "Model v4 · 0.81 confidence" },
    { kind: "decision_created", label: "QUALIFY_LEAD", detail: "Fit 88 · Authority: VP Sales" },
    { kind: "decision_created", label: "RANK_ACCOUNTS", detail: "Reordered 41 prospects" },
  ],
  communication: [
    { kind: "skill_invoked", label: "DRAFT_OUTREACH", detail: "Persona: technical buyer" },
    { kind: "action_executed", label: "SEND_EMAIL", detail: "Thread #8842 · personalized" },
    { kind: "decision_created", label: "READ_REPLY", detail: "Sentiment: warm" },
  ],
  execution: [
    { kind: "tool_called", label: "CRM_LOOKUP", detail: "Account: Northwind Ltd" },
    { kind: "action_executed", label: "CRM_UPDATED", detail: "Stage → Meeting Booked" },
    { kind: "action_executed", label: "CALENDAR_HOLD", detail: "Tue 14:30 · 30m" },
  ],
  reliability: [
    { kind: "skill_invoked", label: "SELF_CHECK", detail: "Policy guardrails passed" },
    { kind: "task_completed", label: "TASK_COMPLETED", detail: "Cycle closed · no retries" },
  ],
}

/**
 * useWorkerStream — emits real events on a cadence and keeps a rolling log.
 * Returns the latest event (for firing visual pulses) and the recent log.
 */
export function useWorkerStream(active = true) {
  const [log, setLog] = useState<WorkerEvent[]>([])
  const [latest, setLatest] = useState<WorkerEvent | null>(null)
  const idRef = useRef(1)
  const stepRef = useRef(0)

  useEffect(() => {
    if (!active) return
    // deterministic-ish walk through capability scripts, weighted toward work
    const weighted: CapabilityId[] = [
      "research",
      "research",
      "reasoning",
      "communication",
      "execution",
      "execution",
      "reasoning",
      "reliability",
    ]

    function emit() {
      const cap = weighted[stepRef.current % weighted.length]
      const script = SCRIPTS[cap]
      const item = script[stepRef.current % script.length]
      stepRef.current += 1
      const ev: WorkerEvent = {
        id: idRef.current++,
        t: Date.now(),
        kind: item.kind,
        capability: cap,
        label: item.label,
        detail: item.detail,
      }
      setLatest(ev)
      setLog((prev) => [ev, ...prev].slice(0, 60))
    }

    // seed a few so the log isn't empty on load
    emit()
    const seed = setTimeout(emit, 350)
    const seed2 = setTimeout(emit, 750)

    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      emit()
      timer = setTimeout(tick, 1100 + Math.random() * 1400)
    }
    timer = setTimeout(tick, 1400)

    return () => {
      clearTimeout(seed)
      clearTimeout(seed2)
      clearTimeout(timer)
    }
  }, [active])

  return { log, latest }
}

export const KIND_META: Record<EventKind, { label: string; tone: "alive" | "grow" | "warn" | "muted" }> = {
  task_started: { label: "task", tone: "muted" },
  skill_invoked: { label: "skill", tone: "alive" },
  tool_called: { label: "tool", tone: "alive" },
  decision_created: { label: "decision", tone: "grow" },
  action_executed: { label: "action", tone: "grow" },
  task_completed: { label: "done", tone: "grow" },
}

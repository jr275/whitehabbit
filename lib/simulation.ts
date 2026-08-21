"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — SIMULATION ENGINE
 * Emits a realistic event stream: discrete tasks that travel through
 * the worker's causal path (research -> reasoning -> communication ->
 * execution -> reliability). Only the relevant capability is active at
 * any moment, so the fabric stays calm and every pulse means something.
 *
 * Decoupled by design (section 27): this file knows nothing about the
 * renderer. It could be swapped for a WebSocket/SSE stream later.
 * ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react"
import type { CapabilityId, EventKind, WorkerEvent } from "./worker"

const TARGETS = [
  "Acme Corporation",
  "Northwind Ltd",
  "Initech",
  "Globex",
  "Umbrella Health",
  "Soylent Foods",
  "Hooli",
  "Stark Industries",
  "Wayne Enterprises",
  "Cyberdyne",
]

interface StepDef {
  from: CapabilityId | "core"
  to: CapabilityId
  kind: EventKind
  label: string
  detail: (target: string) => string
}

/* One task's journey through the fabric. */
const TASK_PATH: StepDef[] = [
  { from: "core", to: "research", kind: "task_started", label: "TASK_STARTED", detail: (t) => t },
  { from: "research", to: "research", kind: "tool_called", label: "WEB_SEARCH", detail: () => 'q="series-b hiring revops"' },
  { from: "research", to: "research", kind: "tool_called", label: "SOURCE_RETRIEVED", detail: () => "12 signals · 3 verified" },
  { from: "research", to: "reasoning", kind: "capability_activated", label: "EVIDENCE_EXTRACTED", detail: () => "funding + headcount delta" },
  { from: "reasoning", to: "reasoning", kind: "decision_created", label: "SCORE_INTENT", detail: () => "model v4 · 0.81 conf" },
  { from: "reasoning", to: "communication", kind: "decision_created", label: "QUALIFY_LEAD", detail: () => "fit 88 · VP Sales" },
  { from: "communication", to: "communication", kind: "action_executed", label: "DRAFT_OUTREACH", detail: () => "persona: technical buyer" },
  { from: "communication", to: "execution", kind: "action_executed", label: "SEND_EMAIL", detail: () => "thread #8842" },
  { from: "execution", to: "execution", kind: "action_executed", label: "CRM_UPDATED", detail: () => "stage → meeting booked" },
  { from: "execution", to: "reliability", kind: "task_completed", label: "TASK_COMPLETED", detail: () => "no retries · policy ok" },
]

export interface ActiveTask {
  id: number
  target: string
  step: number
  total: number
  capability: CapabilityId
}

export interface SimState {
  log: WorkerEvent[]
  latest: WorkerEvent | null
  activeTask: ActiveTask | null
  /** 0-1 activation per capability, decays over time */
  activation: Record<CapabilityId, number>
  completedTasks: number
  running: boolean
}

const EMPTY_ACT: Record<CapabilityId, number> = {
  research: 0,
  reasoning: 0,
  communication: 0,
  execution: 0,
  reliability: 0,
}

export function useSimulation(running: boolean): SimState {
  const [log, setLog] = useState<WorkerEvent[]>([])
  const [latest, setLatest] = useState<WorkerEvent | null>(null)
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const [activation, setActivation] = useState<Record<CapabilityId, number>>(EMPTY_ACT)
  const [completed, setCompleted] = useState(0)

  const evId = useRef(1)
  const taskId = useRef(4281)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!running) return
    let stepIdx = 0
    let target = TARGETS[Math.floor(Math.random() * TARGETS.length)]
    let currentTask = taskId.current

    const clearAll = () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }

    const runStep = () => {
      const def = TASK_PATH[stepIdx]
      const ev: WorkerEvent = {
        id: evId.current++,
        t: Date.now(),
        taskId: currentTask,
        kind: def.kind,
        from: def.from,
        to: def.to,
        label: def.label,
        detail: def.detail(target),
      }
      setLatest(ev)
      setLog((prev) => [ev, ...prev].slice(0, 120))
      setActivation((prev) => ({ ...prev, [def.to]: 1 }))
      setActiveTask({
        id: currentTask,
        target,
        step: stepIdx + 1,
        total: TASK_PATH.length,
        capability: def.to,
      })

      stepIdx += 1
      if (stepIdx < TASK_PATH.length) {
        const gap = 620 + Math.random() * 640
        timers.current.push(setTimeout(runStep, gap))
      } else {
        // task done — increment, rest, then start a fresh task (calm gap)
        setCompleted((c) => c + 1)
        stepIdx = 0
        taskId.current += Math.floor(2 + Math.random() * 6)
        currentTask = taskId.current
        target = TARGETS[Math.floor(Math.random() * TARGETS.length)]
        timers.current.push(
          setTimeout(() => {
            setActiveTask(null)
            timers.current.push(setTimeout(runStep, 900))
          }, 1600),
        )
      }
    }

    // gentle start
    timers.current.push(setTimeout(runStep, 700))

    // continuous decay of activation so idle capabilities go quiet
    const decay = setInterval(() => {
      setActivation((prev) => {
        const next = { ...prev }
        let changed = false
        for (const k of Object.keys(next) as CapabilityId[]) {
          if (next[k] > 0) {
            next[k] = Math.max(0, next[k] - 0.06)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 90)
    timers.current.push(decay as unknown as ReturnType<typeof setTimeout>)

    return () => {
      clearAll()
      clearInterval(decay)
    }
  }, [running])

  return { log, latest, activeTask, activation, completedTasks: completed, running }
}

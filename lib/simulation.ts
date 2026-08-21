"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — WORKER RUNTIME (deterministic execution simulator)
 *
 * Not an animation timeline. A discrete event machine: each task is a
 * scripted sequence of beats that move a signal through the worker's
 * causal path (research -> reasoning -> communication -> execution ->
 * memory -> reliability). Only the relevant capability is active at
 * any moment. When a task completes the worker THINKS and autonomously
 * starts the next one — the user can sit back and watch.
 *
 * Decoupled by design (section 30): this file knows nothing about the
 * renderer. The beat stream could be replaced by SSE / WebSocket /
 * a real agent runtime without touching the Fabric.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  CapabilityId,
  CausalLink,
  EventKind,
  EventStatus,
  ExecutionStatus,
  NodeState,
  WorkerEvent,
  WorkerStatus,
} from "./worker"

/* ------------------------------ types ------------------------------ */

export interface TaskMetrics {
  sources: number
  evidence: number
  confidence: number
}

export interface Decision {
  verdict: string
  confidence: number
  evidence: number
  signals: string[]
  rationale: string
}

export interface Outcome {
  title: string
  kind: string
  confidence: number
  causal: CausalLink[]
}

export interface ExecutionState {
  taskId: number
  company: string
  objective: string
  kind: TaskKind
  status: ExecutionStatus
  currentCapability: CapabilityId | null
  activePath: CapabilityId[]
  metrics: TaskMetrics
  currentAction: string
  startedAt: number
  completedAt?: number
  decision?: Decision
  outcome?: Outcome
  eventIds: number[]
}

export interface QueuedTask {
  id: number
  company: string
  objective: string
  state: "running" | "queued"
}

/* A paused worker awaiting a human decision — the emotional centerpiece.
 * The worker prepared something it is not permitted to send on its own. */
export interface Approval {
  taskId: number
  company: string
  summary: string
  value: string
  confidence: number
  policy: string
}

type TaskKind = "qualify" | "decision_maker" | "contract"

interface TaskDef {
  id: number
  company: string
  objective: string
  kind: TaskKind
  withError: boolean
  /** beat index at which the worker must pause for human approval */
  approvalAt?: number
}

interface Beat {
  dt: number
  kind: EventKind
  from: CapabilityId | "core"
  to: CapabilityId
  label: string
  detail?: string
  status?: EventStatus
  narrative?: string
  payload?: Record<string, string | number | string[]>
  /** the capability that becomes "current" at this beat */
  cap?: CapabilityId | null
  action?: string
  execStatus?: ExecutionStatus
  metrics?: Partial<TaskMetrics>
  /** a brief non-idle node state (success / error) */
  flash?: { cap: CapabilityId; state: NodeState }
  decision?: Decision
  outcome?: Outcome
}

/* --------------------------- task plan ----------------------------- */

const COMPANIES = ["Acme Corporation", "Northwind", "Initech", "Globex", "Umbrella Health"]

const QUALIFY_PATH: CapabilityId[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
  "memory",
  "reliability",
]
const DECISION_PATH: CapabilityId[] = ["research", "reasoning", "memory", "reliability"]

/* Build the ordered beats for one task. Delays are cumulative-friendly
 * (each dt is a gap from the previous beat). Tuned to feel intentional. */
function qualifyBeats(t: TaskDef): Beat[] {
  const C = t.company
  const short = C.split(" ")[0]
  const beats: Beat[] = [
    { dt: 0, kind: "task_created", from: "core", to: "research", label: "TASK_CREATED", detail: `#${t.id} · ${C}`, status: "info", narrative: "Task detected", execStatus: "researching", action: "Task detected" },
    { dt: 700, kind: "task_started", from: "core", to: "research", label: "TASK_STARTED", detail: C, cap: "research", execStatus: "researching", action: `Researching ${short}` },
    { dt: 900, kind: "research_started", from: "research", to: "research", label: "RESEARCH_STARTED", detail: 'q="series-b hiring revops"', cap: "research", narrative: `Researching ${C}`, metrics: { sources: 0, evidence: 0, confidence: 32 } },
    { dt: 900, kind: "source_discovered", from: "research", to: "research", label: "SOURCE_DISCOVERED", detail: "crunchbase · careers page", cap: "research", metrics: { sources: 3, confidence: 41 } },
    { dt: 800, kind: "source_discovered", from: "research", to: "research", label: "SOURCE_DISCOVERED", detail: "eng blog · 10-K filing", cap: "research", metrics: { sources: 8, confidence: 52 } },
    { dt: 800, kind: "source_discovered", from: "research", to: "research", label: "SOURCE_DISCOVERED", detail: "press · linkedin headcount", cap: "research", narrative: "14 sources discovered", metrics: { sources: 14, confidence: 58 } },
    { dt: 1000, kind: "evidence_extracted", from: "research", to: "reasoning", label: "EVIDENCE_EXTRACTED", detail: "funding + headcount delta", cap: "reasoning", execStatus: "reasoning", action: "Analyzing evidence", metrics: { evidence: 6, confidence: 63 }, flash: { cap: "research", state: "success" } },
    { dt: 900, kind: "reasoning_started", from: "reasoning", to: "reasoning", label: "REASONING_STARTED", detail: "model v4", cap: "reasoning", narrative: "Analyzing evidence", metrics: { evidence: 11, confidence: 71 } },
    { dt: 1000, kind: "icp_analysis", from: "reasoning", to: "reasoning", label: "ICP_ANALYSIS", detail: "enterprise size · tech stack · hiring", cap: "reasoning", action: "Evaluating ICP", metrics: { evidence: 14, confidence: 84 } },
    {
      dt: 1100,
      kind: "decision_created",
      from: "reasoning",
      to: "communication",
      label: "DECISION_CREATED",
      detail: "qualified · fit 92",
      cap: "communication",
      execStatus: "communicating",
      action: "Preparing outreach",
      narrative: "Enterprise fit detected · confidence 92%",
      metrics: { confidence: 92 },
      flash: { cap: "reasoning", state: "success" },
      decision: {
        verdict: "Qualified enterprise prospect",
        confidence: 92,
        evidence: 14,
        signals: ["Enterprise size", "Modern tech stack", "Active hiring in RevOps"],
        rationale: "Strong ICP match: funding stage, headcount growth and stack all align with the ideal customer profile.",
      },
    },
    { dt: 1000, kind: "communication_started", from: "communication", to: "communication", label: "COMMUNICATION_STARTED", detail: "persona: technical buyer", cap: "communication", narrative: "Preparing outreach" },
    { dt: 1000, kind: "message_prepared", from: "communication", to: "execution", label: "MESSAGE_PREPARED", detail: "thread #8842 drafted", cap: "execution", execStatus: "executing", action: "Updating CRM", flash: { cap: "communication", state: "success" } },
    { dt: 900, kind: "execution_started", from: "execution", to: "execution", label: "EXECUTION_STARTED", detail: "salesforce · opportunity", cap: "execution", narrative: "Updating CRM" },
  ]

  if (t.withError) {
    beats.push(
      { dt: 1000, kind: "action_failed", from: "execution", to: "execution", label: "CRM_UPDATE_FAILED", detail: "502 · upstream timeout", status: "fail", cap: "execution", execStatus: "failed", action: "Action failed — retrying", narrative: "Action failed — retrying", flash: { cap: "execution", state: "error" } },
      { dt: 1100, kind: "action_retried", from: "execution", to: "execution", label: "RETRYING", detail: "attempt 2 · backoff 1.1s", status: "info", cap: "execution", execStatus: "executing", action: "Retrying CRM update" },
      { dt: 1000, kind: "crm_updated", from: "execution", to: "execution", label: "CRM_UPDATED", detail: "stage → meeting booked", status: "ok", cap: "execution", narrative: "CRM updated", flash: { cap: "execution", state: "success" } },
    )
  } else {
    beats.push({ dt: 1000, kind: "crm_updated", from: "execution", to: "execution", label: "CRM_UPDATED", detail: "stage → meeting booked", status: "ok", cap: "execution", narrative: "CRM updated", flash: { cap: "execution", state: "success" } })
  }

  beats.push(
    { dt: 900, kind: "memory_updated", from: "execution", to: "memory", label: "MEMORY_UPDATED", detail: `${short} · enterprise prospect · 92%`, cap: "memory", action: "Writing to memory", narrative: `Memory updated · ${short} enterprise prospect`, flash: { cap: "memory", state: "success" } },
    { dt: 900, kind: "task_completed", from: "memory", to: "reliability", label: "TASK_COMPLETED", detail: "no policy violations", status: "ok", cap: "reliability", execStatus: "completed", action: "Task complete", narrative: "Task complete", flash: { cap: "reliability", state: "success" } },
    {
      dt: 700,
      kind: "outcome_created",
      from: "reliability",
      to: "reliability",
      label: "OUTCOME_CREATED",
      detail: "qualified prospect",
      cap: null,
      narrative: "Qualified prospect",
      outcome: {
        title: `${short} — Qualified`,
        kind: "Enterprise fit",
        confidence: 92,
        causal: [
          { cap: "outcome", label: "Outcome", detail: "Qualified enterprise prospect" },
          { cap: "task", label: "Task", detail: `Research ${C}` },
          { cap: "reasoning", label: "Decision", detail: "Fit 92 · qualified" },
          { cap: "reasoning", label: "Reasoning", detail: "ICP match across 3 signals" },
          { cap: "research", label: "Research", detail: "14 sources · 14 evidence" },
        ],
      },
    },
  )
  return beats
}

function decisionMakerBeats(t: TaskDef): Beat[] {
  const C = t.company
  const short = C.split(" ")[0]
  return [
    { dt: 0, kind: "task_created", from: "core", to: "research", label: "TASK_CREATED", detail: `#${t.id} · ${C}`, status: "info", narrative: "Task detected", execStatus: "researching", action: "Task detected" },
    { dt: 700, kind: "task_started", from: "core", to: "research", label: "TASK_STARTED", detail: t.objective, cap: "research", execStatus: "researching", action: "Identifying decision maker" },
    { dt: 900, kind: "research_started", from: "research", to: "research", label: "RESEARCH_STARTED", detail: 'q="VP Sales OR CRO"', cap: "research", narrative: `Mapping org chart at ${short}`, metrics: { sources: 0, evidence: 0, confidence: 30 } },
    { dt: 900, kind: "source_discovered", from: "research", to: "research", label: "SOURCE_DISCOVERED", detail: "linkedin · org chart", cap: "research", metrics: { sources: 4, confidence: 44 } },
    { dt: 800, kind: "source_discovered", from: "research", to: "research", label: "SOURCE_DISCOVERED", detail: "press · exec bios", cap: "research", narrative: "6 profiles discovered", metrics: { sources: 6, confidence: 55 } },
    { dt: 1000, kind: "evidence_extracted", from: "research", to: "reasoning", label: "EVIDENCE_EXTRACTED", detail: "seniority + ownership", cap: "reasoning", execStatus: "reasoning", action: "Ranking contacts", metrics: { evidence: 5, confidence: 68 }, flash: { cap: "research", state: "success" } },
    { dt: 1000, kind: "reasoning_started", from: "reasoning", to: "reasoning", label: "RANK_CONTACTS", detail: "authority score", cap: "reasoning", metrics: { confidence: 79 } },
    {
      dt: 1100,
      kind: "decision_created",
      from: "reasoning",
      to: "memory",
      label: "DECISION_CREATED",
      detail: "VP Sales · Dana Whitfield",
      cap: "memory",
      action: "Writing to memory",
      narrative: "Decision maker identified · Dana Whitfield, VP Sales",
      metrics: { confidence: 88 },
      flash: { cap: "reasoning", state: "success" },
      decision: {
        verdict: "Primary contact: Dana Whitfield (VP Sales)",
        confidence: 88,
        evidence: 5,
        signals: ["Budget authority", "Owns RevOps", "Recently expanded team"],
        rationale: "Highest authority score among mapped contacts with direct ownership of the buying area.",
      },
    },
    { dt: 900, kind: "memory_updated", from: "reasoning", to: "memory", label: "MEMORY_UPDATED", detail: `${short} · contact linked`, cap: "memory", narrative: "Memory updated · contact linked to account", flash: { cap: "memory", state: "success" } },
    { dt: 900, kind: "task_completed", from: "memory", to: "reliability", label: "TASK_COMPLETED", detail: "no policy violations", status: "ok", cap: "reliability", execStatus: "completed", action: "Task complete", narrative: "Task complete", flash: { cap: "reliability", state: "success" } },
    {
      dt: 700,
      kind: "outcome_created",
      from: "reliability",
      to: "reliability",
      label: "OUTCOME_CREATED",
      detail: "decision maker mapped",
      cap: null,
      narrative: "Decision maker mapped",
      outcome: {
        title: `${short} — Contact mapped`,
        kind: "Decision maker",
        confidence: 88,
        causal: [
          { cap: "outcome", label: "Outcome", detail: "Dana Whitfield · VP Sales" },
          { cap: "task", label: "Task", detail: `Identify decision maker at ${short}` },
          { cap: "reasoning", label: "Decision", detail: "Highest authority score" },
          { cap: "research", label: "Research", detail: "6 profiles mapped" },
        ],
      },
    },
  ]
}

const CONTRACT_PATH: CapabilityId[] = ["research", "reasoning", "communication", "reliability", "execution", "memory"]
const CONTRACT_VALUES = ["$128,000", "$96,500", "$212,000"]

/* A task that reaches an action the worker is NOT permitted to take on
 * its own. It prepares the contract, then PAUSES — status
 * awaiting_approval — until a human approves. The approval gate is the
 * beat right after MESSAGE_PREPARED (index tracked via approvalAt). */
function contractBeats(t: TaskDef): Beat[] {
  const C = t.company
  const short = C.split(" ")[0]
  const value = CONTRACT_VALUES[t.id % CONTRACT_VALUES.length]
  return [
    { dt: 0, kind: "task_created", from: "core", to: "research", label: "TASK_CREATED", detail: `#${t.id} · ${C}`, status: "info", narrative: "Task detected", execStatus: "researching", action: "Task detected" },
    { dt: 700, kind: "task_started", from: "core", to: "reasoning", label: "TASK_STARTED", detail: "prepare contract", cap: "reasoning", execStatus: "reasoning", action: `Preparing contract for ${short}` },
    { dt: 900, kind: "reasoning_started", from: "reasoning", to: "reasoning", label: "TERMS_COMPUTED", detail: `ACV ${value}`, cap: "reasoning", narrative: `Computing contract terms · ${value}`, metrics: { sources: 6, evidence: 9, confidence: 88 } },
    { dt: 1000, kind: "communication_started", from: "reasoning", to: "communication", label: "COMMUNICATION_STARTED", detail: "drafting contract", cap: "communication", execStatus: "communicating", action: "Drafting contract", metrics: { confidence: 94 } },
    { dt: 1000, kind: "message_prepared", from: "communication", to: "reliability", label: "CONTRACT_PREPARED", detail: `${short} · ${value}`, cap: "reliability", narrative: "Contract prepared — checking policy", flash: { cap: "communication", state: "success" } },
    // ← approvalAt points here: the worker pauses instead of executing
    { dt: 800, kind: "approval_requested", from: "reliability", to: "reliability", label: "APPROVAL_REQUESTED", detail: "policy: human approval required", status: "info", cap: "reliability", execStatus: "thinking", action: "Awaiting your approval", narrative: "Policy requires human approval to send" },
    // --- everything below only runs after approve() ---
    { dt: 900, kind: "execution_started", from: "reliability", to: "execution", label: "SENDING_CONTRACT", detail: "docusign envelope", cap: "execution", execStatus: "executing", action: "Sending contract" },
    { dt: 1000, kind: "action_executed", from: "execution", to: "execution", label: "CONTRACT_SENT", detail: `${short} · ${value}`, status: "ok", cap: "execution", narrative: "Contract sent", flash: { cap: "execution", state: "success" } },
    { dt: 900, kind: "memory_updated", from: "execution", to: "memory", label: "MEMORY_UPDATED", detail: `${short} · contract stage`, cap: "memory", action: "Writing to memory", narrative: `Memory updated · ${short} advanced to contract`, flash: { cap: "memory", state: "success" } },
    { dt: 900, kind: "task_completed", from: "memory", to: "reliability", label: "TASK_COMPLETED", detail: "approved & executed", status: "ok", cap: "reliability", execStatus: "completed", action: "Task complete", narrative: "Task complete", flash: { cap: "reliability", state: "success" } },
    {
      dt: 700, kind: "outcome_created", from: "reliability", to: "reliability", label: "OUTCOME_CREATED", detail: "contract sent", cap: null, narrative: "Contract sent",
      outcome: {
        title: `${short} — Contract sent`,
        kind: "Closed-won pending",
        confidence: 94,
        causal: [
          { cap: "outcome", label: "Outcome", detail: `Contract sent · ${value}` },
          { cap: "task", label: "Task", detail: `Prepare contract for ${short}` },
          { cap: "reasoning", label: "Decision", detail: `Terms computed · ${value}` },
          { cap: "research", label: "Research", detail: "9 evidence items" },
        ],
      },
    },
  ]
}

/* Infinite deterministic task plan: qualify -> decision-maker per
 * company, with a periodic contract task that requires approval. */
function planTasks(count: number): TaskDef[] {
  const tasks: TaskDef[] = []
  let id = 4281
  for (let i = 0; i < count; i++) {
    const company = COMPANIES[i % COMPANIES.length]
    tasks.push({ id: id++, company, objective: `Research ${company} and determine enterprise fit`, kind: "qualify", withError: i === 1 })
    tasks.push({ id: id++, company, objective: `Identify decision maker at ${company}`, kind: "decision_maker", withError: false })
    // every second company, a contract needs sign-off (pauses the worker)
    if (i % 2 === 1) {
      tasks.push({ id: id++, company, objective: `Prepare contract for ${company}`, kind: "contract", withError: false, approvalAt: 5 })
    }
  }
  return tasks
}

function beatsFor(t: TaskDef): Beat[] {
  if (t.kind === "qualify") return qualifyBeats(t)
  if (t.kind === "contract") return contractBeats(t)
  return decisionMakerBeats(t)
}

function pathFor(t: TaskDef): CapabilityId[] {
  if (t.kind === "qualify") return QUALIFY_PATH
  if (t.kind === "contract") return CONTRACT_PATH
  return DECISION_PATH
}

/* --------------------------- runtime ------------------------------- */

const CAP_IDS: CapabilityId[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
  "reliability",
  "memory",
]

const emptyAct = (): Record<CapabilityId, number> =>
  ({ research: 0, reasoning: 0, communication: 0, execution: 0, reliability: 0, memory: 0 })

const idleStates = (): Record<CapabilityId, NodeState> =>
  ({ research: "idle", reasoning: "idle", communication: "idle", execution: "idle", reliability: "idle", memory: "idle" })

export interface RuntimeState {
  log: WorkerEvent[]
  latest: WorkerEvent | null
  exec: ExecutionState | null
  activation: Record<CapabilityId, number>
  capStates: Record<CapabilityId, NodeState>
  workerStatus: WorkerStatus
  queue: QueuedTask[]
  completedTasks: number
  lastOutcome: Outcome | null
  autonomyBanner: string | null
  approval: Approval | null
  running: boolean
  runDemo: () => void
  reset: () => void
  approve: () => void
  reject: () => void
}

export function useSimulation(live: boolean): RuntimeState {
  const [log, setLog] = useState<WorkerEvent[]>([])
  const [latest, setLatest] = useState<WorkerEvent | null>(null)
  const [exec, setExec] = useState<ExecutionState | null>(null)
  const [activation, setActivation] = useState(emptyAct)
  const [capStates, setCapStates] = useState(idleStates)
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("idle")
  const [queue, setQueue] = useState<QueuedTask[]>([])
  const [completed, setCompleted] = useState(0)
  const [lastOutcome, setLastOutcome] = useState<Outcome | null>(null)
  const [autonomyBanner, setAutonomyBanner] = useState<string | null>(null)
  const [approval, setApproval] = useState<Approval | null>(null)
  const [epoch, setEpoch] = useState(0) // bumping restarts the machine

  const evId = useRef(1)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // continuation stored while paused at an approval gate
  const resumeRef = useRef<((granted: boolean) => void) | null>(null)

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    Object.values(flashTimers.current).forEach(clearTimeout)
    flashTimers.current = {}
  }, [])

  const runDemo = useCallback(() => {
    clearTimers()
    setLog([])
    setLatest(null)
    setExec(null)
    setActivation(emptyAct())
    setCapStates(idleStates())
    setQueue([])
    setCompleted(0)
    setLastOutcome(null)
    setAutonomyBanner(null)
    setApproval(null)
    resumeRef.current = null
    evId.current = 1
    setEpoch((e) => e + 1)
  }, [clearTimers])

  const reset = useCallback(() => {
    clearTimers()
    setLog([])
    setLatest(null)
    setExec(null)
    setActivation(emptyAct())
    setCapStates(idleStates())
    setQueue([])
    setLastOutcome(null)
    setAutonomyBanner(null)
    setApproval(null)
    resumeRef.current = null
    setWorkerStatus("idle")
    setEpoch(0)
  }, [clearTimers])

  // human decisions on a paused approval gate
  const approve = useCallback(() => {
    const r = resumeRef.current
    resumeRef.current = null
    setApproval(null)
    r?.(true)
  }, [])
  const reject = useCallback(() => {
    const r = resumeRef.current
    resumeRef.current = null
    setApproval(null)
    r?.(false)
  }, [])

  // start / stop with liveness
  useEffect(() => {
    if (live) setEpoch((e) => (e === 0 ? 1 : e))
    else reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  // the machine itself — re-created whenever epoch changes (demo restart)
  useEffect(() => {
    if (!live || epoch === 0) return
    const tasks = planTasks(60)
    let ti = 0

    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms))
    }

    const setQueueFor = (index: number) => {
      const view: QueuedTask[] = []
      for (let k = index; k < Math.min(index + 3, tasks.length); k++) {
        const tk = tasks[k]
        view.push({ id: tk.id, company: tk.company, objective: tk.objective, state: k === index ? "running" : "queued" })
      }
      setQueue(view)
    }

    const flash = (cap: CapabilityId, state: NodeState) => {
      setCapStates((prev) => ({ ...prev, [cap]: state }))
      if (flashTimers.current[cap]) clearTimeout(flashTimers.current[cap])
      flashTimers.current[cap] = setTimeout(() => {
        setCapStates((prev) => ({ ...prev, [cap]: "idle" }))
      }, state === "error" ? 1400 : 700)
    }

    // emit a single beat's effects (event, activation, node states, exec)
    const emitBeat = (task: TaskDef, b: Beat) => {
      const ev: WorkerEvent = {
        id: evId.current++,
        t: Date.now(),
        taskId: task.id,
        kind: b.kind,
        from: b.from,
        to: b.to,
        label: b.label,
        detail: b.detail,
        status: b.status,
        narrative: b.narrative,
        payload: b.payload,
      }
      setLatest(ev)
      setLog((prev) => [ev, ...prev].slice(0, 200))
      setActivation((prev) => ({ ...prev, [b.to]: 1 }))
      if (b.cap !== undefined) {
        setCapStates((prev) => {
          const s = { ...prev }
          if (b.cap) s[b.cap] = "active"
          return s
        })
      }
      if (b.flash) flash(b.flash.cap, b.flash.state)
      setExec((prev) => {
        if (!prev || prev.taskId !== task.id) return prev
        return {
          ...prev,
          status: b.execStatus ?? prev.status,
          currentCapability: b.cap !== undefined ? b.cap : prev.currentCapability,
          currentAction: b.action ?? prev.currentAction,
          metrics: { ...prev.metrics, ...b.metrics },
          decision: b.decision ?? prev.decision,
          outcome: b.outcome ?? prev.outcome,
          completedAt: b.kind === "task_completed" ? Date.now() : prev.completedAt,
          eventIds: [...prev.eventIds, ev.id],
        }
      })
      if (b.outcome) setLastOutcome(b.outcome)
    }

    // synthetic (non-scripted) event — used for approval decisions
    const emitSynthetic = (task: TaskDef, e: Partial<WorkerEvent> & { kind: EventKind; label: string; to: CapabilityId }) => {
      const ev: WorkerEvent = {
        id: evId.current++,
        t: Date.now(),
        taskId: task.id,
        from: e.from ?? "core",
        status: e.status ?? "info",
        detail: e.detail,
        narrative: e.narrative,
        ...e,
      }
      setLatest(ev)
      setLog((prev) => [ev, ...prev].slice(0, 200))
      setActivation((prev) => ({ ...prev, [ev.to]: 1 }))
    }

    // schedule a slice of beats [startIdx..endIdx]; fire onComplete after
    const scheduleSlice = (task: TaskDef, beats: Beat[], startIdx: number, endIdx: number, onComplete: () => void) => {
      let elapsed = 0
      for (let i = startIdx; i <= endIdx; i++) {
        const b = beats[i]
        elapsed += b.dt
        at(elapsed, () => emitBeat(task, b))
      }
      at(elapsed + 20, onComplete)
    }

    // after a task finishes: complete -> think -> autonomously start next
    const advance = (task: TaskDef) => {
      at(200, () => setCompleted((c) => c + 1))
      const next = tasks[ti + 1]
      if (next) {
        at(1400, () => {
          setWorkerStatus("thinking")
          setCapStates(idleStates())
          setExec((prev) => (prev ? { ...prev, status: "thinking", currentCapability: null, currentAction: "Analyzing next best action…" } : prev))
          emitSynthetic(task, { kind: "autonomous_action", to: "reasoning", label: "AUTONOMOUS_ACTION", detail: "next best action", narrative: "Analyzing next best action…" })
        })
        at(3000, () => {
          const short = next.company.split(" ")[0]
          setAutonomyBanner(
            next.kind === "decision_maker"
              ? `The worker chose to identify the decision maker at ${short}.`
              : next.kind === "contract"
                ? `The worker chose to prepare a contract for ${short}.`
                : `The worker chose to research ${short}.`,
          )
          timers.current.push(setTimeout(() => setAutonomyBanner(null), 3600))
        })
        at(3200, () => {
          ti += 1
          playTask(next)
        })
      } else {
        at(1400, () => {
          setWorkerStatus("idle")
          setCapStates(idleStates())
        })
      }
    }

    const buildApproval = (task: TaskDef): Approval => {
      const short = task.company.split(" ")[0]
      const value = CONTRACT_VALUES[task.id % CONTRACT_VALUES.length]
      return {
        taskId: task.id,
        company: task.company,
        summary: `I prepared a contract for ${short}.`,
        value,
        confidence: 94,
        policy: "Human approval required",
      }
    }

    const playTask = (task: TaskDef) => {
      const beats = beatsFor(task)
      const path = pathFor(task)
      setQueueFor(ti)
      setWorkerStatus("working")

      // seed the execution state
      setExec({
        taskId: task.id,
        company: task.company,
        objective: task.objective,
        kind: task.kind,
        status: "researching",
        currentCapability: null,
        activePath: path,
        metrics: { sources: 0, evidence: 0, confidence: 0 },
        currentAction: "Task detected",
        startedAt: Date.now(),
        eventIds: [],
      })
      // queue-state the path so unrelated nodes read as disabled
      setCapStates(() => {
        const s = idleStates()
        for (const id of CAP_IDS) s[id] = path.includes(id) ? "queued" : "disabled"
        return s
      })

      const gate = task.approvalAt
      if (gate === undefined) {
        scheduleSlice(task, beats, 0, beats.length - 1, () => advance(task))
        return
      }

      // run up to & including the approval-request beat, then PAUSE
      scheduleSlice(task, beats, 0, gate, () => {
        setWorkerStatus("awaiting_approval")
        setApproval(buildApproval(task))
        setExec((prev) =>
          prev && prev.taskId === task.id
            ? { ...prev, status: "thinking", currentAction: "Awaiting your approval" }
            : prev,
        )
        // the human decides — approve() / reject() invoke this continuation
        resumeRef.current = (granted: boolean) => {
          if (granted) {
            setWorkerStatus("working")
            emitSynthetic(task, { kind: "approval_granted", to: "execution", from: "reliability", status: "ok", label: "APPROVAL_GRANTED", detail: "human approved", narrative: "Approved — resuming" })
            setExec((prev) => (prev && prev.taskId === task.id ? { ...prev, status: "executing", currentAction: "Resuming — executing" } : prev))
            scheduleSlice(task, beats, gate + 1, beats.length - 1, () => advance(task))
          } else {
            emitSynthetic(task, { kind: "approval_rejected", to: "reliability", from: "reliability", status: "fail", label: "APPROVAL_REJECTED", detail: "human rejected", narrative: "Rejected — standing down" })
            setExec((prev) => (prev && prev.taskId === task.id ? { ...prev, status: "completed", currentAction: "Action rejected — moved on" } : prev))
            advance(task)
          }
        }
      })
    }

    // continuous activation decay so idle capabilities go quiet
    const decay = setInterval(() => {
      setActivation((prev) => {
        let changed = false
        const next = { ...prev }
        for (const k of CAP_IDS) {
          if (next[k] > 0) {
            next[k] = Math.max(0, next[k] - 0.05)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 90)
    timers.current.push(decay as unknown as ReturnType<typeof setTimeout>)

    // gentle start
    at(600, () => playTask(tasks[0]))

    return () => {
      clearTimers()
      clearInterval(decay)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, live])

  return useMemo(
    () => ({
      log,
      latest,
      exec,
      activation,
      capStates,
      workerStatus,
      queue,
      completedTasks: completed,
      lastOutcome,
      autonomyBanner,
      approval,
      running: live && epoch > 0,
      runDemo,
      reset,
      approve,
      reject,
    }),
    [log, latest, exec, activation, capStates, workerStatus, queue, completed, lastOutcome, autonomyBanner, approval, live, epoch, runDemo, reset, approve, reject],
  )
}

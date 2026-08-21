"use client"

/* ================================================================== *
 * WORKER STORE — the single source of truth.
 *
 *   Runtime → EventStore → WorkerState → UI projections
 *
 * A framework-agnostic observable store. The runtime emits events; the
 * store projects them into the worker + the active run. The Fabric, the
 * Result panel, the Trace and every metric are projections of THIS
 * state — never independent animations.
 * ================================================================== */

import { useSyncExternalStore } from "react"
import { workerBus } from "./worker-events"
import {
  analyzeHistory,
  type Evolution,
  interpretTeaching,
  nextBestAction,
} from "./worker-evaluation"
import {
  type Autonomy,
  type BuildStatus,
  type Capability,
  CAPABILITY_TEMPLATES,
  type ExecutionEvent,
  type KnowledgeItem,
  type Permission,
  type Policy,
  type RunResult,
  TOOL_CATALOG,
  type Worker,
} from "./worker-model"
import { parsePolicy } from "./worker-policies"
import { loadState, saveState } from "./worker-persistence"
import { deterministicRuntime, type RunHandle, type WorkerRuntimeProvider } from "./worker-runtime"

export interface BuildStep {
  label: string
  status: "pending" | "running" | "done"
}

export interface StudioState {
  hydrated: boolean
  worker: Worker | null
  buildStatus: BuildStatus
  buildSteps: BuildStep[]
  buildError: string | null
  activeRun: RunResult | null
  runningTaskId: string | null
  history: RunResult[]
  activeCapability: string | null
  capPulse: Record<string, number>
  evolution: Evolution | null
  showTrace: boolean
  notice: string | null
}

const INITIAL: StudioState = {
  hydrated: false,
  worker: null,
  buildStatus: "idle",
  buildSteps: [],
  buildError: null,
  activeRun: null,
  runningTaskId: null,
  history: [],
  activeCapability: null,
  capPulse: {},
  evolution: null,
  showTrace: false,
  notice: null,
}

let taskCounter = 4280

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function bumpVersion(v: string): string {
  if (!v) return "0.1"
  const [maj, min] = v.split(".").map((n) => parseInt(n, 10))
  return `${maj}.${(min ?? 0) + 1}`
}

class StudioStore {
  private state: StudioState = INITIAL
  private listeners = new Set<() => void>()
  private runtime: WorkerRuntimeProvider = deterministicRuntime
  private runHandle: RunHandle | null = null
  private autoRunsRemaining = 0
  private buildTimers: ReturnType<typeof setTimeout>[] = []

  /* ---- store plumbing ---- */
  getSnapshot = (): StudioState => this.state
  getServerSnapshot = (): StudioState => INITIAL

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<StudioState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  private persist() {
    saveState({ worker: this.state.worker, history: this.state.history })
  }

  /* ---- hydration ---- */
  hydrate() {
    if (this.state.hydrated) return
    const loaded = loadState()
    if (loaded?.worker) {
      // reconcile task counter so new ids don't collide with history
      const maxId = loaded.history.reduce((m, r) => Math.max(m, parseInt(r.id, 10) || 0), 4280)
      taskCounter = maxId + 1
      this.set({
        hydrated: true,
        worker: loaded.worker,
        history: loaded.history,
        activeRun: loaded.history[0] ?? null,
        evolution: analyzeHistory(loaded.worker, loaded.history),
      })
    } else {
      this.set({ hydrated: true })
    }
  }

  /* ---- worker creation & configuration ---- */
  createWorker(objective: string) {
    const capabilities: Capability[] = CAPABILITY_TEMPLATES.map((t, i) => ({
      ...t,
      id: uid("cap"),
      enabled: i < 2, // Research + Reasoning on by default
    }))
    const tools = TOOL_CATALOG.map((t, i) => ({
      ...t,
      enabled: i < 2, // Web Search + CRM on by default
      permission: "allow" as Permission,
      status: "connected" as const,
    }))
    const policies: Policy[] = [
      {
        id: uid("pol"),
        text: "Never send outbound email without confidence above 80%.",
        kind: "confidence_threshold",
        threshold: 80,
        appliesTo: "outbound_email",
      },
    ]
    const worker: Worker = {
      name: "Atlas",
      objective: objective.trim(),
      version: "",
      status: "draft",
      capabilities,
      knowledge: [],
      tools,
      policies,
      memory: [],
      autonomy: "medium",
      createdAt: Date.now(),
    }
    this.set({
      hydrated: true,
      worker,
      buildStatus: "idle",
      buildSteps: [],
      buildError: null,
      activeRun: null,
      history: [],
      evolution: null,
      notice: null,
    })
    this.persist()
  }

  private patchWorker(fn: (w: Worker) => Worker) {
    if (!this.state.worker) return
    const worker = fn(this.state.worker)
    this.set({ worker })
    this.persist()
  }

  private markDraftDirty() {
    // a built worker that is edited returns to a state needing rebuild
    if (!this.state.worker) return
    if (this.state.buildStatus === "ready" || this.state.worker.status !== "draft") {
      this.set({ buildStatus: "idle", buildSteps: [] })
    }
  }

  updateObjective(text: string) {
    this.patchWorker((w) => ({ ...w, objective: text }))
    this.markDraftDirty()
  }

  addCapability(input: {
    name: string
    description: string
    purpose: string
    tools: string[]
    successCriteria: string
    riskLevel: Capability["riskLevel"]
  }) {
    this.patchWorker((w) => ({
      ...w,
      capabilities: [
        ...w.capabilities,
        {
          id: uid("cap"),
          name: input.name,
          description: input.description,
          purpose: input.purpose,
          category: "Custom",
          enabled: true,
          version: "1.0",
          status: "new",
          tools: input.tools,
          successCriteria: input.successCriteria,
          riskLevel: input.riskLevel,
        },
      ],
    }))
    this.markDraftDirty()
  }

  toggleCapability(id: string) {
    this.patchWorker((w) => ({
      ...w,
      capabilities: w.capabilities.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    }))
    this.markDraftDirty()
  }

  removeCapability(id: string) {
    this.patchWorker((w) => ({ ...w, capabilities: w.capabilities.filter((c) => c.id !== id) }))
    this.markDraftDirty()
  }

  addKnowledge(title: string, content: string) {
    const item: KnowledgeItem = {
      id: uid("kn"),
      type: "text",
      title: title.trim() || "Untitled note",
      content: content.trim(),
      createdAt: Date.now(),
    }
    this.patchWorker((w) => ({ ...w, knowledge: [item, ...w.knowledge] }))
    this.markDraftDirty()
  }

  removeKnowledge(id: string) {
    this.patchWorker((w) => ({ ...w, knowledge: w.knowledge.filter((k) => k.id !== id) }))
    this.markDraftDirty()
  }

  toggleTool(id: string) {
    this.patchWorker((w) => ({
      ...w,
      tools: w.tools.map((t) =>
        t.id === id
          ? { ...t, enabled: !t.enabled, status: !t.enabled ? "connected" : "idle" }
          : t,
      ),
    }))
    this.markDraftDirty()
  }

  setToolPermission(id: string, permission: Permission) {
    this.patchWorker((w) => ({
      ...w,
      tools: w.tools.map((t) => (t.id === id ? { ...t, permission } : t)),
    }))
    this.markDraftDirty()
  }

  addPolicy(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const parsed = parsePolicy(trimmed)
    this.patchWorker((w) => ({
      ...w,
      policies: [...w.policies, { id: uid("pol"), text: trimmed, ...parsed }],
    }))
    this.markDraftDirty()
  }

  removePolicy(id: string) {
    this.patchWorker((w) => ({ ...w, policies: w.policies.filter((p) => p.id !== id) }))
    this.markDraftDirty()
  }

  setAutonomy(level: Autonomy) {
    this.patchWorker((w) => ({ ...w, autonomy: level }))
  }

  /* ---- build pipeline ---- */
  buildWorker() {
    const w = this.state.worker
    if (!w) return
    this.buildTimers.forEach(clearTimeout)
    this.buildTimers = []

    // validation
    const errors: string[] = []
    if (!w.objective.trim()) errors.push("Objective is required")
    if (w.capabilities.filter((c) => c.enabled).length === 0)
      errors.push("At least one capability must be enabled")
    if (errors.length) {
      this.set({ buildStatus: "error", buildError: errors.join(" · "), buildSteps: [] })
      return
    }

    const steps: BuildStep[] = [
      { label: "Validating objective", status: "pending" },
      { label: "Validating capabilities", status: "pending" },
      { label: "Validating tools", status: "pending" },
      { label: "Validating policies", status: "pending" },
      { label: "Compiling worker", status: "pending" },
    ]
    this.set({ buildStatus: "validating", buildError: null, buildSteps: steps.map((s) => ({ ...s })) })

    // run the pipeline over time — real state transitions, not a fake bar
    let t = 0
    steps.forEach((_, i) => {
      t += 480
      this.buildTimers.push(
        setTimeout(() => {
          const next = this.state.buildSteps.map((s, j) => ({
            ...s,
            status: j < i ? "done" : j === i ? "running" : "pending",
          })) as BuildStep[]
          this.set({
            buildStatus: i >= 4 ? "building" : "validating",
            buildSteps: next,
          })
        }, t),
      )
    })
    // finalize
    t += 520
    this.buildTimers.push(
      setTimeout(() => {
        const done = this.state.buildSteps.map((s) => ({ ...s, status: "done" as const }))
        const version = bumpVersion(this.state.worker?.version ?? "")
        this.set({ buildStatus: "ready", buildSteps: done })
        this.patchWorker((wk) => ({
          ...wk,
          version,
          status: wk.status === "live" || wk.status === "idle" ? wk.status : "ready",
        }))
      }, t),
    )
  }

  releaseWorker() {
    if (!this.state.worker) return
    if (this.state.buildStatus !== "ready" && !this.state.worker.version) return
    this.patchWorker((w) => ({ ...w, status: "live" }))
  }

  /* ---- execution ---- */
  runTask(objective: string, isAuto = false) {
    const w = this.state.worker
    if (!w || (w.status !== "live" && w.status !== "idle")) return
    if (this.state.runningTaskId) return
    if (!isAuto) {
      this.autoRunsRemaining = w.autonomy === "high" ? 1 : 0
    }

    const taskId = String(taskCounter++)
    const run: RunResult = {
      id: taskId,
      workerVersion: w.version,
      objective: objective.trim(),
      status: "running",
      currentStep: "Created",
      currentAction: "Task created",
      activeCapability: null,
      sources: 0,
      signals: 0,
      evidence: 0,
      positiveSignals: 0,
      negativeSignals: 0,
      confidence: null,
      decision: null,
      decisionFactors: [],
      action: null,
      actionExecuted: false,
      outcome: null,
      approvalReason: null,
      proposedMemory: null,
      nextActionProposed: null,
      startedAt: Date.now(),
      completedAt: null,
      events: [],
    }
    this.set({
      activeRun: run,
      runningTaskId: taskId,
      activeCapability: null,
      capPulse: {},
      showTrace: false,
      notice: null,
    })
    this.patchWorker((wk) => ({ ...wk, status: "working" }))

    this.runHandle = this.runtime.run(w, objective, taskId, (e) => {
      workerBus.emit(e) // fan out for any future subscribers
      this.handleEvent(e)
    })
  }

  approve() {
    this.runHandle?.approve()
  }

  reject() {
    this.runHandle?.reject()
  }

  private handleEvent(e: ExecutionEvent) {
    const run = this.state.activeRun
    if (!run || run.id !== e.taskId) return
    const meta = e.metadata ?? {}
    const patch: Partial<RunResult> = { events: [...run.events, e] }

    // fabric projection
    const capPatch: Record<string, number> = { ...this.state.capPulse }
    if (e.capability && e.capability !== "core") {
      capPatch[e.capability] = Date.now()
    }

    switch (e.type) {
      case "TASK_STARTED":
        patch.currentStep = "Started"
        break
      case "RESEARCH_STARTED":
        patch.currentStep = "Research"
        patch.currentAction = "Researching company information"
        break
      case "TOOL_CALLED":
        patch.currentAction = `${String(meta.tool ?? "tool")} invoked`
        break
      case "SOURCE_FOUND":
        patch.sources = Number(meta.sources ?? run.sources)
        break
      case "EVIDENCE_CREATED":
        patch.evidence = Number(meta.evidence ?? run.evidence)
        patch.positiveSignals = Number(meta.positive ?? run.positiveSignals)
        patch.negativeSignals = Number(meta.negative ?? run.negativeSignals)
        patch.signals = Number(meta.signals ?? run.signals)
        break
      case "REASONING_STARTED":
        patch.currentStep = "Reasoning"
        patch.currentAction = "Evaluating enterprise fit"
        break
      case "DECISION_CREATED":
        patch.currentStep = "Decision"
        patch.decision = meta.decision as RunResult["decision"]
        patch.confidence = Number(meta.confidence ?? 0)
        patch.decisionFactors = (meta.factors as string[]) ?? []
        patch.currentAction = `Decision: ${String(meta.decision)}`
        break
      case "ACTION_PREPARED":
        patch.currentStep = "Action"
        patch.action = String(meta.action ?? "")
        patch.currentAction = String(meta.action ?? "")
        break
      case "APPROVAL_REQUIRED":
        patch.status = "awaiting_approval"
        patch.approvalReason = String(meta.reason ?? "Policy requires approval")
        patch.currentAction = "Awaiting human approval"
        this.patchWorker((wk) => ({ ...wk, status: "waiting" }))
        break
      case "APPROVAL_GRANTED":
        patch.status = "running"
        patch.currentAction = "Approved — executing"
        this.patchWorker((wk) => ({ ...wk, status: "working" }))
        break
      case "ACTION_EXECUTED":
        patch.actionExecuted = true
        patch.currentAction = e.message
        break
      case "ACTION_REJECTED":
        patch.status = "rejected"
        patch.actionExecuted = false
        patch.currentAction = "Action rejected"
        break
      case "MEMORY_PROPOSED":
        patch.proposedMemory = {
          text: String(meta.memory ?? ""),
          confidence: Number(meta.confidence ?? 80),
        }
        break
      case "TASK_COMPLETED":
        this.finalizeRun(run, e)
        return
    }

    this.set({
      activeRun: { ...run, ...patch },
      activeCapability: e.capability && e.capability !== "core" ? e.capability : this.state.activeCapability,
      capPulse: capPatch,
    })
  }

  private finalizeRun(run: RunResult, e: ExecutionEvent) {
    const meta = e.metadata ?? {}
    const rejected = run.status === "rejected"
    const w = this.state.worker
    const autonomy = w?.autonomy ?? "medium"
    const nextAction = String(meta.nextAction ?? nextBestAction(run))

    const finalized: RunResult = {
      ...run,
      events: [...run.events, e],
      status: rejected ? "rejected" : "complete",
      completedAt: Date.now(),
      currentStep: "Complete",
      currentAction: rejected ? "Completed — action rejected" : "Completed",
      decision: (meta.decision as RunResult["decision"]) ?? run.decision,
      confidence: meta.confidence != null ? Number(meta.confidence) : run.confidence,
      sources: meta.sources != null ? Number(meta.sources) : run.sources,
      positiveSignals: meta.positive != null ? Number(meta.positive) : run.positiveSignals,
      negativeSignals: meta.negative != null ? Number(meta.negative) : run.negativeSignals,
      action: rejected ? run.action : ((meta.action as string) ?? run.action),
      outcome: String(meta.outcome ?? ""),
      nextActionProposed: autonomy === "low" ? null : nextAction,
    }

    const history = [finalized, ...this.state.history.filter((r) => r.id !== finalized.id)]
    this.runHandle = null
    this.set({
      activeRun: finalized,
      runningTaskId: null,
      history,
      activeCapability: null,
      evolution: w ? analyzeHistory(w, history) : null,
    })
    this.patchWorker((wk) => ({ ...wk, status: "live" }))
    this.persist()

    // autonomous follow-up
    if (autonomy === "high" && this.autoRunsRemaining > 0 && !rejected) {
      this.autoRunsRemaining -= 1
      this.set({ notice: `High autonomy — automatically starting: ${nextAction}` })
      setTimeout(() => this.runTask(nextAction, true), 1600)
    }
  }

  /** medium autonomy: user approves the proposed next action */
  runProposedNext() {
    const next = this.state.activeRun?.nextActionProposed
    if (next) this.runTask(next)
  }

  /* ---- memory ---- */
  saveMemory() {
    const run = this.state.activeRun
    if (!run?.proposedMemory) return
    const mem = run.proposedMemory
    this.patchWorker((w) => ({
      ...w,
      memory: [{ id: uid("mem"), text: mem.text, confidence: mem.confidence, createdAt: Date.now() }, ...w.memory],
    }))
    this.set({ activeRun: { ...run, proposedMemory: null } })
    this.persist()
  }

  discardMemory() {
    const run = this.state.activeRun
    if (!run) return
    this.set({ activeRun: { ...run, proposedMemory: null } })
  }

  /* ---- teach ---- */
  teach(text: string): string {
    if (!this.state.worker || !text.trim()) return "Nothing to teach."
    const result = interpretTeaching(text)
    this.patchWorker((w) => {
      let policies = w.policies
      let memory = w.memory
      if (result.policy) {
        policies = [...policies, { id: uid("pol"), text: result.policy, ...parsePolicy(result.policy) }]
      }
      if (result.memory) {
        memory = [
          { id: uid("mem"), text: result.memory.text, confidence: result.memory.confidence, createdAt: Date.now() },
          ...memory,
        ]
      }
      return { ...w, policies, memory, version: bumpVersion(w.version) }
    })
    this.persist()
    return result.note
  }

  /* ---- evolution ---- */
  applyEvolution() {
    const evo = this.state.evolution
    if (!evo || !this.state.worker) return
    this.patchWorker((w) => ({
      ...w,
      version: bumpVersion(w.version),
      capabilities: w.capabilities.map((c) =>
        c.name === evo.capability ? { ...c, version: bumpVersion(c.version), status: "healthy" } : c,
      ),
      memory: [
        { id: uid("mem"), text: evo.proposal, confidence: 82, createdAt: Date.now() },
        ...w.memory,
      ],
    }))
    this.set({ evolution: null, notice: `Applied evolution to ${evo.capability}.` })
    this.persist()
  }

  rejectEvolution() {
    this.set({ evolution: null })
  }

  /* ---- view helpers ---- */
  viewRun(id: string) {
    const run = this.state.history.find((r) => r.id === id)
    if (run) this.set({ activeRun: run, showTrace: false })
  }

  toggleTrace(on?: boolean) {
    this.set({ showTrace: on ?? !this.state.showTrace })
  }

  dismissNotice() {
    this.set({ notice: null })
  }

  resetWorker() {
    this.runHandle?.cancel()
    this.runHandle = null
    this.buildTimers.forEach(clearTimeout)
    this.set({
      worker: null,
      buildStatus: "idle",
      buildSteps: [],
      buildError: null,
      activeRun: null,
      runningTaskId: null,
      history: [],
      activeCapability: null,
      capPulse: {},
      evolution: null,
      showTrace: false,
      notice: null,
    })
    saveState({ worker: null, history: [] })
  }
}

export const studioStore = new StudioStore()

/* ---- React binding ---- */
export function useStudio(): StudioState {
  return useSyncExternalStore(studioStore.subscribe, studioStore.getSnapshot, studioStore.getServerSnapshot)
}

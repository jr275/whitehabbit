"use client"

/* ================================================================== *
 * WORKFORCE STORE — the single source of truth behind Studio, Outputs,
 * Worker Overview and Evolve.
 *
 *   Studio Builder  →  Worker (draft/live)
 *   Run Worker      →  engine.runWorker() event stream
 *   Event stream    →  Task / Execution / Output records, live
 *   Every surface   →  reads workers/tasks/executions/outputs from HERE
 *
 * A framework-agnostic observable store (useSyncExternalStore), same
 * shape as the legacy lib/worker/worker-state.ts store, scoped to the
 * new multi-worker content/growth model.
 * ================================================================== */

import { useSyncExternalStore } from "react"
import { CHANNEL_CATALOG, SKILL_CATALOG, TOOL_CATALOG } from "./catalog"
import { runWorker as engineRun, type RunHandle } from "./engine"
import type {
  Autonomy,
  BehaviorRule,
  ChannelId,
  KnowledgeSource,
  Worker,
  WorkerEvent,
  WorkerExecution,
  WorkerIdentity,
  WorkerOutput,
  WorkerStatus,
  WorkerTask,
} from "./model"
import { loadWorkforce, saveWorkforce } from "./persistence"
import { buildSeedWorkforce } from "./seed"

export interface WorkforceState {
  hydrated: boolean
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
  events: WorkerEvent[]
  runningExecutionIds: string[]
  activeWorkerId: string | null
  testingWorkerId: string | null
  notice: string | null
}

const INITIAL: WorkforceState = {
  hydrated: false,
  workers: [],
  tasks: [],
  executions: [],
  outputs: [],
  events: [],
  runningExecutionIds: [],
  activeWorkerId: null,
  testingWorkerId: null,
  notice: null,
}

let idSeq = 0
function uid(prefix: string): string {
  idSeq += 1
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${idSeq}`
}

/** Simple, readable heuristic: split a mission sentence into objective phrases. */
export function deriveObjectivesFromMission(mission: string): string[] {
  const cleaned = mission.trim().replace(/\.$/, "")
  if (!cleaned) return []
  const parts = cleaned
    .split(/,| and /i)
    .map((p) => p.trim())
    .filter((p) => p.length > 2)
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
}

class WorkforceStore {
  private state: WorkforceState = INITIAL
  private listeners = new Set<() => void>()
  private runHandles = new Map<string, { handle: RunHandle; pending: Set<string> }>()

  getSnapshot = (): WorkforceState => this.state
  getServerSnapshot = (): WorkforceState => INITIAL

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<WorkforceState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  private persist() {
    saveWorkforce({
      workers: this.state.workers,
      tasks: this.state.tasks,
      executions: this.state.executions,
      outputs: this.state.outputs,
    })
  }

  /* ---- hydration ---- */
  hydrate() {
    if (this.state.hydrated) return
    const loaded = loadWorkforce()
    if (loaded && loaded.workers.length > 0) {
      this.set({
        hydrated: true,
        workers: loaded.workers,
        tasks: loaded.tasks,
        executions: loaded.executions,
        outputs: loaded.outputs,
        activeWorkerId: loaded.workers[0]?.id ?? null,
      })
    } else {
      const seed = buildSeedWorkforce()
      this.set({
        hydrated: true,
        workers: seed.workers,
        tasks: seed.tasks,
        executions: seed.executions,
        outputs: seed.outputs,
        activeWorkerId: seed.workers[0]?.id ?? null,
      })
      this.persist()
    }
  }

  private patchWorker(workerId: string, fn: (w: Worker) => Worker) {
    let changed = false
    const workers = this.state.workers.map((w) => {
      if (w.id !== workerId) return w
      changed = true
      return fn(w)
    })
    if (!changed) return
    this.set({ workers })
  }

  /* ---- worker lifecycle ---- */
  createDraftWorker(): string {
    const id = uid("worker")
    const worker: Worker = {
      id,
      identity: { name: "", role: "", description: "", persona: "", tone: [], accent: "#5a6ef0", initials: "NW" },
      mission: "",
      objectives: [],
      knowledge: [],
      skills: SKILL_CATALOG.map((t) => ({ id: t.id, name: t.name, category: t.category, produces: t.produces, enabled: false })),
      tools: TOOL_CATALOG.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        connected: false,
        risk: t.risk,
        actions: t.actions.map((label, i) => ({ id: `${t.id}_a${i}`, label, enabled: false })),
      })),
      behaviors: [],
      channels: CHANNEL_CATALOG.map((c) => ({ id: c.id, name: c.name, connected: false })),
      autonomy: "medium",
      status: "draft",
      tested: false,
      createdAt: Date.now(),
      releasedAt: null,
    }
    this.set({ workers: [worker, ...this.state.workers], activeWorkerId: id })
    this.persist()
    return id
  }

  selectWorker(id: string) {
    if (this.state.workers.some((w) => w.id === id)) this.set({ activeWorkerId: id })
  }

  deleteWorker(id: string) {
    this.runHandles.get(id)?.handle.cancel()
    this.runHandles.delete(id)
    const workers = this.state.workers.filter((w) => w.id !== id)
    this.set({
      workers,
      activeWorkerId: this.state.activeWorkerId === id ? (workers[0]?.id ?? null) : this.state.activeWorkerId,
    })
    this.persist()
  }

  /* ---- 01 Identity ---- */
  updateIdentity(workerId: string, patch: Partial<WorkerIdentity>) {
    this.patchWorker(workerId, (w) => {
      const identity = { ...w.identity, ...patch }
      if (patch.name !== undefined) {
        identity.initials = patch.name.trim().slice(0, 2).toUpperCase() || "NW"
      }
      return { ...w, identity }
    })
    this.persist()
  }

  toggleTone(workerId: string, trait: string) {
    this.patchWorker(workerId, (w) => {
      const has = w.identity.tone.includes(trait)
      return { ...w, identity: { ...w.identity, tone: has ? w.identity.tone.filter((t) => t !== trait) : [...w.identity.tone, trait] } }
    })
    this.persist()
  }

  /* ---- 02 Mission ---- */
  setMission(workerId: string, mission: string) {
    this.patchWorker(workerId, (w) => ({ ...w, mission }))
  }

  deriveObjectives(workerId: string) {
    this.patchWorker(workerId, (w) => ({
      ...w,
      objectives: deriveObjectivesFromMission(w.mission).map((text) => ({ id: uid("obj"), text, done: true })),
    }))
    this.persist()
  }

  addObjective(workerId: string, text: string) {
    if (!text.trim()) return
    this.patchWorker(workerId, (w) => ({ ...w, objectives: [...w.objectives, { id: uid("obj"), text: text.trim(), done: true }] }))
    this.persist()
  }

  editObjective(workerId: string, objId: string, text: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.map((o) => (o.id === objId ? { ...o, text } : o)) }))
    this.persist()
  }

  toggleObjective(workerId: string, objId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.map((o) => (o.id === objId ? { ...o, done: !o.done } : o)) }))
    this.persist()
  }

  removeObjective(workerId: string, objId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.filter((o) => o.id !== objId) }))
    this.persist()
  }

  /* ---- 03 Knowledge ---- */
  addKnowledge(workerId: string, item: { name: string; type: KnowledgeSource["type"]; documents: number }) {
    const source: KnowledgeSource = { id: uid("kn"), addedAt: Date.now(), ...item }
    this.patchWorker(workerId, (w) => ({ ...w, knowledge: [source, ...w.knowledge] }))
    this.persist()
  }

  removeKnowledge(workerId: string, id: string) {
    this.patchWorker(workerId, (w) => ({ ...w, knowledge: w.knowledge.filter((k) => k.id !== id) }))
    this.persist()
  }

  /* ---- 04 Skills ---- */
  toggleSkill(workerId: string, skillId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, skills: w.skills.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s)) }))
    this.persist()
  }

  /* ---- 05 Tools ---- */
  toggleTool(workerId: string, toolId: string) {
    this.patchWorker(workerId, (w) => ({
      ...w,
      tools: w.tools.map((t) =>
        t.id === toolId
          ? { ...t, connected: !t.connected, actions: t.actions.map((a) => ({ ...a, enabled: !t.connected })) }
          : t,
      ),
    }))
    this.persist()
  }

  toggleToolAction(workerId: string, toolId: string, actionId: string) {
    this.patchWorker(workerId, (w) => ({
      ...w,
      tools: w.tools.map((t) =>
        t.id === toolId ? { ...t, actions: t.actions.map((a) => (a.id === actionId ? { ...a, enabled: !a.enabled } : a)) } : t,
      ),
    }))
    this.persist()
  }

  /* ---- 06 Behavior ---- */
  addBehavior(workerId: string, raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    const m = trimmed.match(/^\s*IF\s+(.+?)\s*(?:→|->)\s*(.+?)\s*$/i)
    const rule: BehaviorRule = { id: uid("beh"), raw: trimmed, condition: m?.[1] ?? trimmed, action: m?.[2] ?? "" }
    this.patchWorker(workerId, (w) => ({ ...w, behaviors: [...w.behaviors, rule] }))
    this.persist()
  }

  removeBehavior(workerId: string, id: string) {
    this.patchWorker(workerId, (w) => ({ ...w, behaviors: w.behaviors.filter((b) => b.id !== id) }))
    this.persist()
  }

  /* ---- 07 Channels ---- */
  toggleChannel(workerId: string, channelId: ChannelId) {
    this.patchWorker(workerId, (w) => ({ ...w, channels: w.channels.map((c) => (c.id === channelId ? { ...c, connected: !c.connected } : c)) }))
    this.persist()
  }

  setAutonomy(workerId: string, level: Autonomy) {
    this.patchWorker(workerId, (w) => ({ ...w, autonomy: level }))
    this.persist()
  }

  /* ---- 08 Test ---- */
  testWorker(workerId: string) {
    const worker = this.state.workers.find((w) => w.id === workerId)
    if (!worker) return
    this.set({ testingWorkerId: workerId })
    setTimeout(() => {
      const passes = worker.identity.name.trim().length > 0 && worker.mission.trim().length > 0 && worker.skills.some((s) => s.enabled)
      this.patchWorker(workerId, (w) => ({ ...w, tested: passes, status: passes && w.status === "draft" ? "ready" : w.status }))
      this.set({ testingWorkerId: null, notice: passes ? null : "Test failed — add an identity, a mission and at least one skill." })
      this.persist()
    }, 900)
  }

  /* ---- 09 Release ---- */
  releaseWorker(workerId: string) {
    const worker = this.state.workers.find((w) => w.id === workerId)
    if (!worker || !worker.tested) return
    this.patchWorker(workerId, (w) => ({ ...w, status: "live", releasedAt: Date.now() }))
    this.persist()
  }

  /* ---- Run Worker ---- */
  runWorker(workerId: string) {
    const worker = this.state.workers.find((w) => w.id === workerId)
    if (!worker) return
    if (worker.status !== "live" && worker.status !== "idle") return
    if (this.runHandles.has(workerId)) return
    if (!worker.skills.some((s) => s.enabled)) return

    this.patchWorker(workerId, (w) => ({ ...w, status: "working" }))
    const pending = new Set<string>()
    const handle = engineRun(worker, (e) => this.handleEvent(workerId, e, pending))
    this.runHandles.set(workerId, { handle, pending })
  }

  private handleEvent(workerId: string, e: WorkerEvent, pending: Set<string>) {
    const events = [e, ...this.state.events].slice(0, 200)

    switch (e.type) {
      case "task_started": {
        const { task, execution } = e.payload as { task: WorkerTask; execution: WorkerExecution }
        pending.add(execution.id)
        this.set({
          events,
          tasks: [task, ...this.state.tasks],
          executions: [execution, ...this.state.executions],
          runningExecutionIds: [...this.state.runningExecutionIds, execution.id],
        })
        break
      }
      case "progress": {
        const { done, target } = e.payload as { done: number; target: number }
        this.set({
          events,
          executions: this.state.executions.map((x) =>
            x.id === e.executionId ? { ...x, done, target, progress: Math.round((done / target) * 100) } : x,
          ),
        })
        break
      }
      case "output_created": {
        const { output } = e.payload as { output: WorkerOutput }
        this.set({ events, outputs: [output, ...this.state.outputs] })
        break
      }
      case "task_completed": {
        this.set({
          events,
          tasks: this.state.tasks.map((t) => (t.id === e.taskId ? { ...t, status: "completed" } : t)),
          executions: this.state.executions.map((x) =>
            x.id === e.executionId ? { ...x, status: "completed", completedAt: Date.now(), progress: 100 } : x,
          ),
          runningExecutionIds: this.state.runningExecutionIds.filter((id) => id !== e.executionId),
        })
        pending.delete(e.executionId)
        if (pending.size === 0) {
          this.runHandles.delete(workerId)
          this.patchWorker(workerId, (w) => ({ ...w, status: "live" }))
          this.persist()
        }
        break
      }
      default:
        this.set({ events })
    }
  }

  isRunning(workerId: string): boolean {
    return this.runHandles.has(workerId)
  }

  dismissNotice() {
    this.set({ notice: null })
  }
}

export const workforceStore = new WorkforceStore()
export type { WorkerStatus }

export function useWorkforce(): WorkforceState {
  return useSyncExternalStore(workforceStore.subscribe, workforceStore.getSnapshot, workforceStore.getServerSnapshot)
}

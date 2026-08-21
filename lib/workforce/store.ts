"use client"

/* ================================================================== *
 * WORKFORCE STORE — the client's view of the real server-side ledger.
 *
 *   Studio Builder edits  -> optimistic local update, debounced PATCH
 *                             to /api/workers/[id] (real SQLite write)
 *   Run Worker / Test     -> POST /api/workers/[id]/run, a real NDJSON
 *                             stream of WorkerEvents from a real
 *                             skill/tool execution on the server
 *   Everything else       -> GET /api/state (the canonical DB read)
 *
 * The UI never knows whether execution is local, server-side, queued
 * or streamed — it only ever sees this store's snapshot and calls its
 * methods. That boundary is what lets the transport (today: a fetch +
 * ReadableStream) change later without touching Studio or Outputs.
 * ================================================================== */

import { useSyncExternalStore } from "react"
import { SKILL_CATALOG } from "./catalog"
import type {
  Autonomy,
  BusinessEvent,
  ChannelId,
  KnowledgeSource,
  MetricRecord,
  Worker,
  WorkerEvent,
  WorkerExecution,
  WorkerOutput,
  WorkerTask,
} from "./model"

export interface WorkforceState {
  hydrated: boolean
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
  events: WorkerEvent[]
  metrics: MetricRecord[]
  businessEvents: BusinessEvent[]
  runningWorkerIds: string[]
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
  metrics: [],
  businessEvents: [],
  runningWorkerIds: [],
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

class WorkforceStore {
  private state: WorkforceState = INITIAL
  private listeners = new Set<() => void>()
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>()

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

  /* ---- hydration: read real state, seed once if the org is empty ---- */
  async hydrate() {
    if (this.state.hydrated) return
    try {
      let data = await api<{ workers: Worker[]; tasks: WorkerTask[]; executions: WorkerExecution[]; outputs: WorkerOutput[]; metrics: MetricRecord[]; businessEvents: BusinessEvent[] }>("/api/state")
      if (data.workers.length === 0) {
        await api("/api/seed", { method: "POST" })
        data = await api("/api/state")
      }
      this.set({
        hydrated: true,
        workers: data.workers,
        tasks: data.tasks,
        executions: data.executions,
        outputs: data.outputs,
        metrics: data.metrics,
        businessEvents: data.businessEvents,
        activeWorkerId: data.workers[0]?.id ?? null,
      })
    } catch (err) {
      console.log("[v0] hydrate failed", err)
      this.set({ hydrated: true, notice: err instanceof Error ? err.message : "Failed to load workers." })
    }
  }

  async refetchState() {
    try {
      const data = await api<{ workers: Worker[]; tasks: WorkerTask[]; executions: WorkerExecution[]; outputs: WorkerOutput[]; metrics: MetricRecord[]; businessEvents: BusinessEvent[] }>("/api/state")
      this.set({ workers: data.workers, tasks: data.tasks, executions: data.executions, outputs: data.outputs, metrics: data.metrics, businessEvents: data.businessEvents })
    } catch (err) {
      console.log("[v0] refetch failed", err)
    }
  }

  private patchWorker(workerId: string, fn: (w: Worker) => Worker) {
    let changed = false
    const workers = this.state.workers.map((w) => {
      if (w.id !== workerId) return w
      changed = true
      return fn(w)
    })
    if (changed) this.set({ workers })
  }

  /** Debounced real persistence — every edit eventually becomes a real PATCH. */
  private schedulePersist(workerId: string) {
    const existing = this.persistTimers.get(workerId)
    if (existing) clearTimeout(existing)
    this.persistTimers.set(
      workerId,
      setTimeout(() => this.persistNow(workerId), 500),
    )
  }

  private async persistNow(workerId: string) {
    const worker = this.state.workers.find((w) => w.id === workerId)
    if (!worker) return
    try {
      const { worker: saved } = await api<{ worker: Worker }>(`/api/workers/${workerId}`, {
        method: "PATCH",
        body: JSON.stringify({ worker }),
      })
      this.patchWorker(workerId, () => saved)
    } catch (err) {
      console.log("[v0] persist failed", err)
      this.set({ notice: "Could not save changes — check the connection and try again." })
    }
  }

  /* ---- worker lifecycle ---- */
  async createDraftWorker(): Promise<string> {
    const { worker } = await api<{ worker: Worker }>("/api/workers", { method: "POST" })
    this.set({ workers: [worker, ...this.state.workers], activeWorkerId: worker.id })
    return worker.id
  }

  selectWorker(id: string) {
    if (this.state.workers.some((w) => w.id === id)) this.set({ activeWorkerId: id })
  }

  async deleteWorker(id: string) {
    const workers = this.state.workers.filter((w) => w.id !== id)
    this.set({ workers, activeWorkerId: this.state.activeWorkerId === id ? (workers[0]?.id ?? null) : this.state.activeWorkerId })
    try {
      await api(`/api/workers/${id}`, { method: "DELETE" })
    } catch (err) {
      console.log("[v0] delete failed", err)
    }
  }

  /* ---- 01 Identity ---- */
  updateIdentity(workerId: string, patch: Partial<Worker["identity"]>) {
    this.patchWorker(workerId, (w) => {
      const identity = { ...w.identity, ...patch }
      if (patch.name !== undefined) identity.initials = patch.name.trim().slice(0, 2).toUpperCase() || "NW"
      return { ...w, identity }
    })
    this.schedulePersist(workerId)
  }

  toggleTone(workerId: string, trait: string) {
    this.patchWorker(workerId, (w) => {
      const has = w.identity.tone.includes(trait)
      return { ...w, identity: { ...w.identity, tone: has ? w.identity.tone.filter((t) => t !== trait) : [...w.identity.tone, trait] } }
    })
    this.schedulePersist(workerId)
  }

  /* ---- 02 Mission + Outcome ---- */
  setMission(workerId: string, mission: string) {
    this.patchWorker(workerId, (w) => ({ ...w, mission }))
    this.schedulePersist(workerId)
  }

  deriveObjectives(workerId: string) {
    this.patchWorker(workerId, (w) => ({
      ...w,
      objectives: deriveObjectivesFromMission(w.mission).map((text) => ({ id: uid("obj"), text, done: true })),
    }))
    this.schedulePersist(workerId)
  }

  addObjective(workerId: string, text: string) {
    if (!text.trim()) return
    this.patchWorker(workerId, (w) => ({ ...w, objectives: [...w.objectives, { id: uid("obj"), text: text.trim(), done: true }] }))
    this.schedulePersist(workerId)
  }

  editObjective(workerId: string, objId: string, text: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.map((o) => (o.id === objId ? { ...o, text } : o)) }))
    this.schedulePersist(workerId)
  }

  toggleObjective(workerId: string, objId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.map((o) => (o.id === objId ? { ...o, done: !o.done } : o)) }))
    this.schedulePersist(workerId)
  }

  removeObjective(workerId: string, objId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.filter((o) => o.id !== objId) }))
    this.schedulePersist(workerId)
  }

  setOutcome(workerId: string, patch: Partial<Worker["outcome"]>) {
    this.patchWorker(workerId, (w) => ({ ...w, outcome: { ...w.outcome, ...patch } }))
    this.schedulePersist(workerId)
  }

  /* ---- 03 Knowledge ---- */
  addKnowledge(workerId: string, item: { name: string; type: KnowledgeSource["type"]; documents: number }) {
    const source: KnowledgeSource = { id: uid("kn"), addedAt: Date.now(), ...item }
    this.patchWorker(workerId, (w) => ({ ...w, knowledge: [source, ...w.knowledge] }))
    this.schedulePersist(workerId)
  }

  removeKnowledge(workerId: string, id: string) {
    this.patchWorker(workerId, (w) => ({ ...w, knowledge: w.knowledge.filter((k) => k.id !== id) }))
    this.schedulePersist(workerId)
  }

  /* ---- 04 Skills ---- */
  toggleSkill(workerId: string, skillId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, skills: w.skills.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s)) }))
    this.schedulePersist(workerId)
  }

  /* ---- 05 Tools — enabling is permission; `connected` is real and server-owned ---- */
  toggleTool(workerId: string, toolId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, tools: w.tools.map((t) => (t.id === toolId ? { ...t, enabled: !t.enabled } : t)) }))
    this.schedulePersist(workerId)
  }

  /* ---- 06 Behavior ---- */
  addBehavior(workerId: string, raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    const m = trimmed.match(/^\s*IF\s+(.+?)\s*(?:→|->)\s*(.+?)\s*$/i)
    this.patchWorker(workerId, (w) => ({
      ...w,
      behaviors: [...w.behaviors, { id: uid("beh"), raw: trimmed, condition: m?.[1] ?? trimmed, action: m?.[2] ?? "" }],
    }))
    this.schedulePersist(workerId)
  }

  removeBehavior(workerId: string, id: string) {
    this.patchWorker(workerId, (w) => ({ ...w, behaviors: w.behaviors.filter((b) => b.id !== id) }))
    this.schedulePersist(workerId)
  }

  /* ---- 07 Channels ---- */
  toggleChannel(workerId: string, channelId: ChannelId) {
    this.patchWorker(workerId, (w) => ({ ...w, channels: w.channels.map((c) => (c.id === channelId ? { ...c, connected: !c.connected } : c)) }))
    this.schedulePersist(workerId)
  }

  setAutonomy(workerId: string, level: Autonomy) {
    this.patchWorker(workerId, (w) => ({ ...w, autonomy: level }))
    this.schedulePersist(workerId)
  }

  /* ---- 08 Test — actually executes the real worker ---- */
  async testWorker(workerId: string) {
    this.set({ testingWorkerId: workerId })
    const outcome = await this.runWorker(workerId)
    this.patchWorker(workerId, (w) => ({
      ...w,
      tested: w.tested || outcome === "completed",
      status: (w.tested || outcome === "completed") && w.status === "draft" ? "ready" : w.status,
    }))
    this.set({
      testingWorkerId: null,
      notice: outcome === "completed" ? null : outcome === "blocked" ? "Test blocked — see the execution timeline for the real reason." : "Test failed — see the execution timeline for the real reason.",
    })
    this.schedulePersist(workerId)
  }

  /* ---- 09 Release ---- */
  releaseWorker(workerId: string) {
    const worker = this.state.workers.find((w) => w.id === workerId)
    if (!worker || !worker.tested) return
    this.patchWorker(workerId, (w) => ({ ...w, status: "live", releasedAt: Date.now() }))
    this.schedulePersist(workerId)
  }

  isRunning(workerId: string): boolean {
    return this.state.runningWorkerIds.includes(workerId)
  }

  /* ---- Run Worker — a real, streamed execution ---- */
  async runWorker(workerId: string): Promise<"completed" | "blocked" | "failed" | "error"> {
    const worker = this.state.workers.find((w) => w.id === workerId)
    if (!worker) return "error"
    if (this.isRunning(workerId)) return "error"
    const skill = worker.skills.find((s) => s.enabled)
    if (!skill) {
      this.set({ notice: "Enable a skill before running this worker." })
      return "error"
    }
    const template = SKILL_CATALOG.find((t) => t.id === skill.id)
    const input: Record<string, string> = { query: worker.mission || worker.identity.description || "" }

    this.set({ runningWorkerIds: [...this.state.runningWorkerIds, workerId] })
    let outcome: "completed" | "blocked" | "failed" | "error" = "error"

    try {
      const res = await fetch(`/api/workers/${workerId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId: skill.id, input }),
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        this.set({ notice: body?.error ?? "The run could not start." })
        outcome = "error"
      } else {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let idx: number
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            if (!line) continue
            try {
              const parsed = JSON.parse(line)
              if (parsed.type === "stream_error") {
                this.set({ notice: parsed.error })
                outcome = "error"
              } else {
                const result = this.handleRuntimeEvent(parsed as WorkerEvent, template?.taskTitle ?? skill.name)
                if (result) outcome = result
              }
            } catch {
              // ignore a partial/unparseable line — the next chunk completes it
            }
          }
        }
      }
    } catch (err) {
      this.set({ notice: err instanceof Error ? err.message : "The run failed unexpectedly." })
      outcome = "error"
    }

    this.set({ runningWorkerIds: this.state.runningWorkerIds.filter((id) => id !== workerId) })
    await this.refetchState()
    return outcome
  }

  /** Applies one real event to local state for instant feedback, and
   * reports task_completed/blocked/failed back to the caller. */
  private handleRuntimeEvent(event: WorkerEvent, taskTitle: string): "completed" | "blocked" | "failed" | null {
    const events = [event, ...this.state.events].slice(0, 300)

    if (event.type === "task_started") {
      const skillId = String(event.payload.skillId ?? "")
      const template = SKILL_CATALOG.find((t) => t.id === skillId)
      const task: WorkerTask = {
        id: event.taskId,
        workerId: event.workerId,
        skillId,
        type: template?.category ?? "research",
        title: taskTitle,
        status: "running",
        createdAt: event.timestamp,
      }
      const execution: WorkerExecution = {
        id: event.executionId,
        workerId: event.workerId,
        taskId: event.taskId,
        status: "running",
        startedAt: event.timestamp,
        completedAt: null,
      }
      this.set({ events, tasks: [task, ...this.state.tasks], executions: [execution, ...this.state.executions] })
      return null
    }

    if (event.type === "task_completed" || event.type === "task_blocked" || event.type === "task_failed") {
      const status = event.type === "task_completed" ? "completed" : event.type === "task_blocked" ? "blocked" : "failed"
      this.set({
        events,
        tasks: this.state.tasks.map((t) => (t.id === event.taskId ? { ...t, status } : t)),
        executions: this.state.executions.map((e) =>
          e.id === event.executionId ? { ...e, status, completedAt: event.timestamp, blockedReason: (event.payload.reason as string) ?? e.blockedReason } : e,
        ),
      })
      return status
    }

    this.set({ events })
    return null
  }

  dismissNotice() {
    this.set({ notice: null })
  }
}

export const workforceStore = new WorkforceStore()

export function useWorkforce(): WorkforceState {
  return useSyncExternalStore(workforceStore.subscribe, workforceStore.getSnapshot, workforceStore.getServerSnapshot)
}

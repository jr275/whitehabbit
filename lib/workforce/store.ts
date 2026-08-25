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

/** Which Build category a just-completed real save belongs to — lets the
 * canvas briefly acknowledge the matching capability card. Set only
 * after persistNow()'s PATCH actually succeeds; never on keystroke. */
export type SaveCategory = "identity" | "mission" | "knowledge" | "skills" | "tools" | "behavior" | "channels"

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
  releasingWorkerId: string | null
  creatingWorker: boolean
  loadingExample: boolean
  notice: string | null
  lastSaved: { workerId: string; category: SaveCategory; at: number } | null
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
  releasingWorkerId: null,
  creatingWorker: false,
  loadingExample: false,
  notice: null,
  lastSaved: null,
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
  /** In-flight /api/state request, if any — React Strict Mode (dev)
   * double-invokes effects, so two components/effects can both call
   * hydrate() before the first `this.state.hydrated` flips true. Without
   * this, that races two real fetches; whichever resolves LAST silently
   * overwrites activeWorkerId back to workers[0], clobbering an explicit
   * selection (e.g. landing on ?worker=<id> from Assemble Worker) made
   * in between. Sharing one in-flight promise makes hydrate() safe to
   * call from multiple places concurrently. */
  private hydratePromise: Promise<void> | null = null

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

  /* ---- hydration: read the authenticated org's real state.
   * Deliberately does NOT auto-seed demo data just because the org has
   * zero workers — that would silently populate a real production
   * organization with a fake Worker the first time someone signs in.
   * See loadExampleWorker() for the explicit, user-initiated version. */
  hydrate(): Promise<void> {
    if (this.state.hydrated) return Promise.resolve()
    if (this.hydratePromise) return this.hydratePromise
    this.hydratePromise = (async () => {
      try {
        const data = await api<{ workers: Worker[]; tasks: WorkerTask[]; executions: WorkerExecution[]; outputs: WorkerOutput[]; events: WorkerEvent[]; metrics: MetricRecord[]; businessEvents: BusinessEvent[] }>("/api/state")
        this.set({
          hydrated: true,
          workers: data.workers,
          tasks: data.tasks,
          executions: data.executions,
          outputs: data.outputs,
          events: data.events,
          metrics: data.metrics,
          businessEvents: data.businessEvents,
          activeWorkerId: data.workers[0]?.id ?? null,
        })
        await this.reconcileActiveExecutions()
      } catch (err) {
        console.log("[v0] hydrate failed", err)
        this.set({ hydrated: true, notice: err instanceof Error ? err.message : "Failed to load workers." })
      }
    })()
    return this.hydratePromise
  }

  /** Explicit, user-initiated: adds the example Worker (Atlas) to the
   * current organization via a real Build + Release, not a fabricated
   * "live" flag. See app/api/seed/route.ts. */
  async loadExampleWorker() {
    if (this.state.loadingExample) return
    this.set({ loadingExample: true })
    try {
      const data = await api<{ workers: Worker[] }>("/api/seed", { method: "POST" })
      this.set({ workers: data.workers, activeWorkerId: data.workers[0]?.id ?? this.state.activeWorkerId })
    } catch (err) {
      console.log("[v0] load example worker failed", err)
      this.set({ notice: err instanceof Error ? err.message : "Could not load the example worker." })
    } finally {
      this.set({ loadingExample: false })
    }
  }

  async refetchState() {
    try {
      const data = await api<{ workers: Worker[]; tasks: WorkerTask[]; executions: WorkerExecution[]; outputs: WorkerOutput[]; events: WorkerEvent[]; metrics: MetricRecord[]; businessEvents: BusinessEvent[] }>("/api/state")
      this.set({ workers: data.workers, tasks: data.tasks, executions: data.executions, outputs: data.outputs, events: data.events, metrics: data.metrics, businessEvents: data.businessEvents })
    } catch (err) {
      console.log("[v0] refetch failed", err)
    }
  }

  /** Reconciles executions that may have outlived a browser stream. The
   * execution endpoint is the durable source of truth; the NDJSON response is
   * only an acceleration path for the tab that started the run. */
  async reconcileActiveExecutions() {
    const active = this.state.executions.filter((execution) => execution.status === "running" || execution.status === "queued")
    if (!active.length) return
    const settled = await Promise.allSettled(
      active.map((execution) => api<{ execution: WorkerExecution; events: WorkerEvent[] }>(`/api/executions/${execution.id}`)),
    )
    let executions = this.state.executions
    let events = this.state.events
    for (const result of settled) {
      if (result.status !== "fulfilled") continue
      executions = executions.map((item) => item.id === result.value.execution.id ? result.value.execution : item)
      const incomingIds = new Set(result.value.events.map((event) => event.id))
      events = [...result.value.events, ...events.filter((event) => !incomingIds.has(event.id))]
    }
    this.set({ executions, events: events.slice(0, 2000) })
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

  private pendingSaveCategory = new Map<string, SaveCategory>()

  /** Debounced real persistence — every edit eventually becomes a real
   * PATCH. `category` (when given) is what lastSaved reports once this
   * specific save actually succeeds — a real confirmation, not a typing
   * indicator. */
  private schedulePersist(workerId: string, category?: SaveCategory) {
    if (category) this.pendingSaveCategory.set(workerId, category)
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
    const category = this.pendingSaveCategory.get(workerId)
    this.pendingSaveCategory.delete(workerId)
    try {
      const { worker: saved } = await api<{ worker: Worker }>(`/api/workers/${workerId}`, {
        method: "PATCH",
        body: JSON.stringify({ worker }),
      })
      this.patchWorker(workerId, () => saved)
      if (category) this.set({ lastSaved: { workerId, category, at: Date.now() } })
    } catch (err) {
      console.log("[v0] persist failed", err)
      this.set({ notice: "Could not save changes — check the connection and try again." })
    }
  }

  /* ---- worker lifecycle ----
   * The one canonical creation path — the empty-state CTA and the
   * "+ New worker" switcher entry both call this and nothing else.
   * The in-flight guard lives here, not in a component, so it protects
   * every caller: a second call while one is already in flight is a
   * no-op rather than a second real POST/DB row (see TEST D). */
  async createDraftWorker(): Promise<string | null> {
    if (this.state.creatingWorker) return null
    this.set({ creatingWorker: true })
    try {
      const { worker } = await api<{ worker: Worker }>("/api/workers", { method: "POST" })
      this.set({ workers: [worker, ...this.state.workers], activeWorkerId: worker.id })
      return worker.id
    } catch (err) {
      console.log("[v0] create worker failed", err)
      this.set({ notice: err instanceof Error ? err.message : "Could not create a new worker — check the connection and try again." })
      return null
    } finally {
      this.set({ creatingWorker: false })
    }
  }

  async assembleWorker(objective: string): Promise<string | null> {
    if (this.state.creatingWorker || !objective.trim()) return null
    this.set({ creatingWorker: true, notice: null })
    try {
      const { worker } = await api<{ worker: Worker }>("/api/agents/blueprint", {
        method: "POST",
        body: JSON.stringify({ objective: objective.trim() }),
      })
      this.set({ workers: [worker, ...this.state.workers.filter((item) => item.id !== worker.id)], activeWorkerId: worker.id })
      return worker.id
    } catch (err) {
      console.log("[v0] assemble worker failed", err)
      this.set({ notice: err instanceof Error ? err.message : "Could not assemble this worker — refine the objective and try again." })
      return null
    } finally {
      this.set({ creatingWorker: false })
    }
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
    this.schedulePersist(workerId, "identity")
  }

  toggleTone(workerId: string, trait: string) {
    this.patchWorker(workerId, (w) => {
      const has = w.identity.tone.includes(trait)
      return { ...w, identity: { ...w.identity, tone: has ? w.identity.tone.filter((t) => t !== trait) : [...w.identity.tone, trait] } }
    })
    this.schedulePersist(workerId, "identity")
  }

  /* ---- 02 Mission + Outcome ---- */
  setMission(workerId: string, mission: string) {
    this.patchWorker(workerId, (w) => ({ ...w, mission }))
    this.schedulePersist(workerId, "mission")
  }

  deriveObjectives(workerId: string) {
    this.patchWorker(workerId, (w) => ({
      ...w,
      objectives: deriveObjectivesFromMission(w.mission).map((text) => ({ id: uid("obj"), text, done: true })),
    }))
    this.schedulePersist(workerId, "mission")
  }

  addObjective(workerId: string, text: string) {
    if (!text.trim()) return
    this.patchWorker(workerId, (w) => ({ ...w, objectives: [...w.objectives, { id: uid("obj"), text: text.trim(), done: true }] }))
    this.schedulePersist(workerId, "mission")
  }

  editObjective(workerId: string, objId: string, text: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.map((o) => (o.id === objId ? { ...o, text } : o)) }))
    this.schedulePersist(workerId, "mission")
  }

  toggleObjective(workerId: string, objId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.map((o) => (o.id === objId ? { ...o, done: !o.done } : o)) }))
    this.schedulePersist(workerId, "mission")
  }

  removeObjective(workerId: string, objId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, objectives: w.objectives.filter((o) => o.id !== objId) }))
    this.schedulePersist(workerId, "mission")
  }

  setOutcome(workerId: string, patch: Partial<Worker["outcome"]>) {
    this.patchWorker(workerId, (w) => ({ ...w, outcome: { ...w.outcome, ...patch } }))
    this.schedulePersist(workerId, "mission")
  }

  /* ---- 03 Knowledge ---- */
  addKnowledge(workerId: string, item: { name: string; type: KnowledgeSource["type"]; documents: number }) {
    const source: KnowledgeSource = { id: uid("kn"), addedAt: Date.now(), ...item }
    this.patchWorker(workerId, (w) => ({ ...w, knowledge: [source, ...w.knowledge] }))
    this.schedulePersist(workerId, "knowledge")
  }

  removeKnowledge(workerId: string, id: string) {
    this.patchWorker(workerId, (w) => ({ ...w, knowledge: w.knowledge.filter((k) => k.id !== id) }))
    this.schedulePersist(workerId, "knowledge")
  }

  /** Real, operator-authored reference text for one knowledge source —
   * the only thing the runtime's KnowledgeRetriever ever reads from. */
  setKnowledgeContent(workerId: string, id: string, content: string) {
    this.patchWorker(workerId, (w) => ({ ...w, knowledge: w.knowledge.map((k) => (k.id === id ? { ...k, content } : k)) }))
    this.schedulePersist(workerId, "knowledge")
  }

  /* ---- 04 Skills ---- */
  toggleSkill(workerId: string, skillId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, skills: w.skills.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s)) }))
    this.schedulePersist(workerId, "skills")
  }

  /* ---- 05 Tools — enabling is permission; `connected` is real and server-owned ---- */
  toggleTool(workerId: string, toolId: string) {
    this.patchWorker(workerId, (w) => ({ ...w, tools: w.tools.map((t) => (t.id === toolId ? { ...t, enabled: !t.enabled } : t)) }))
    this.schedulePersist(workerId, "tools")
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
    this.schedulePersist(workerId, "behavior")
  }

  removeBehavior(workerId: string, id: string) {
    this.patchWorker(workerId, (w) => ({ ...w, behaviors: w.behaviors.filter((b) => b.id !== id) }))
    this.schedulePersist(workerId, "behavior")
  }

  /* ---- 07 Channels ----
   * A channel connection is an external credential/webhook fact owned by
   * backend integration infrastructure. Studio must never manufacture it by
   * toggling a persisted boolean. */
  toggleChannel(_workerId: string, _channelId: ChannelId) {
    this.set({ notice: "Channel connection management is unavailable until a backend connector is configured." })
  }

  setAutonomy(workerId: string, level: Autonomy) {
    this.patchWorker(workerId, (w) => ({ ...w, autonomy: level }))
    this.schedulePersist(workerId, "channels")
  }

  /* ---- 08 Test — Build (freeze an immutable version from the current
   * draft) then execute exactly that version. Never runs the live
   * draft directly — same guarantee a released run gets. ---- */
  async testWorker(workerId: string) {
    this.set({ testingWorkerId: workerId })
    try {
      await api(`/api/workers/${workerId}/build`, { method: "POST" })
    } catch (err) {
      this.set({ testingWorkerId: null, notice: err instanceof Error ? err.message : "Build failed." })
      return
    }

    const outcome = await this.runWorker(workerId, { mode: "test" })
    this.patchWorker(workerId, (w) => ({
      ...w,
      tested: w.tested || outcome === "completed",
    }))
    this.set({
      testingWorkerId: null,
      notice:
        outcome === "completed"
          ? null
          : outcome === "blocked"
            ? "Test blocked — see the execution timeline for the real reason."
            : outcome === "pending_approval"
              ? "Test halted — this action requires human approval before it can run."
              : "Test failed — see the execution timeline for the real reason.",
    })
    await this.refetchState()
  }

  /* ---- 09 Release — promotes the just-built version to LIVE via a
   * real server-side transition. Never sets status/releasedAt locally
   * before the server confirms it. ---- */
  async releaseWorker(workerId: string) {
    const worker = this.state.workers.find((w) => w.id === workerId)
    if (!worker || !worker.tested || this.state.releasingWorkerId) return
    this.set({ releasingWorkerId: workerId })
    try {
      const { worker: released } = await api<{ worker: Worker }>(`/api/workers/${workerId}/release`, { method: "POST" })
      this.patchWorker(workerId, () => released)
    } catch (err) {
      console.log("[v0] release failed", err)
      this.set({ notice: err instanceof Error ? err.message : "Could not release this worker." })
    } finally {
      this.set({ releasingWorkerId: null })
    }
  }

  isRunning(workerId: string): boolean {
    return this.state.runningWorkerIds.includes(workerId)
  }

  /* ---- Run Worker — a real, streamed execution of a specific,
   * immutable WorkerVersion. mode "release" (default) runs the
   * worker's live released version; mode "test" runs the version
   * Build just produced from the current draft. ---- */
  async runWorker(workerId: string, opts: { mode?: "release" | "test" } = {}): Promise<"completed" | "blocked" | "failed" | "pending_approval" | "error"> {
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
    let outcome: "completed" | "blocked" | "failed" | "pending_approval" | "error" = "error"

    try {
      const res = await fetch(`/api/workers/${workerId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId: skill.id, input, mode: opts.mode ?? "release" }),
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
    await this.reconcileActiveExecutions()
    return outcome
  }

  /** Applies one real event to local state for instant feedback, and
   * reports task_completed/blocked/failed back to the caller. */
  private handleRuntimeEvent(event: WorkerEvent, taskTitle: string): "completed" | "blocked" | "failed" | "pending_approval" | null {
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

    if (event.type === "task_completed" || event.type === "task_blocked" || event.type === "task_failed" || event.type === "approval_required") {
      const status = event.type === "task_completed" ? "completed" : event.type === "task_blocked" ? "blocked" : event.type === "approval_required" ? "pending_approval" : "failed"
      const reasonCode = event.payload.reasonCode as WorkerExecution["reasonCode"] | undefined
      this.set({
        events,
        tasks: this.state.tasks.map((t) => (t.id === event.taskId ? { ...t, status } : t)),
        executions: this.state.executions.map((e) =>
          e.id === event.executionId
            ? { ...e, status, completedAt: event.timestamp, reasonCode: reasonCode ?? e.reasonCode, blockedReason: (event.payload.reason as string) ?? e.blockedReason }
            : e,
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

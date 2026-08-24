"use client"

/* ================================================================== *
 * DEMO WORKFORCE STORE
 *
 * A small external store (useSyncExternalStore) that owns the demo
 * division: workers, skills, outcomes, a live activity feed, and the
 * human-approval queue. Runs are executed through the ExecutionProvider
 * seam so the UI never touches provider internals.
 *
 * State persists to localStorage (session-durable) and hydrates after
 * mount so SSR and the first client render agree. A real store would
 * persist to the backend instead — the shape is intentionally simple.
 * ------------------------------------------------------------------ */

import { useEffect, useSyncExternalStore } from "react"
import { demoExecutionProvider } from "./execution"
import type {
  ActivityEvent,
  ApprovalRequest,
  DemoWorker,
  Division,
  EvolveRecommendation,
  ExecutionProvider,
  Skill,
  WorkOutcome,
  WorkerState,
} from "./model"
import { SKILL_MATURITY_META, type SkillMaturity } from "./model"
import { DIVISION, OUTCOMES, SKILLS, WORKERS } from "./seed"

export interface DemoState {
  division: Division
  workers: DemoWorker[]
  skills: Skill[]
  outcomes: WorkOutcome[]
  activity: ActivityEvent[]
  approvals: ApprovalRequest[]
  /** worker ids currently mid-run */
  running: string[]
  /** the outcome the current division was assembled around (from homepage) */
  assembledFor: string | null
}

const MAX_ACTIVITY = 60
const STORAGE_KEY = "wh.workforce.demo.v1"

function maturityFor(proficiency: number): SkillMaturity {
  const bands: SkillMaturity[] = ["mastered", "expert", "practiced", "seed"]
  for (const b of bands) if (proficiency >= SKILL_MATURITY_META[b].min) return b
  return "seed"
}

let seq = 0
const nid = (p: string) => `${p}-${Date.now()}-${(seq += 1)}`

class DemoStore {
  private provider: ExecutionProvider = demoExecutionProvider
  private listeners = new Set<() => void>()
  private hydrated = false
  /** promises awaiting a human decision, keyed by approval id */
  private approvalResolvers = new Map<string, (approved: boolean) => void>()

  private state: DemoState = {
    division: DIVISION,
    workers: WORKERS.map((w) => ({ ...w })),
    skills: SKILLS.map((s) => ({ ...s })),
    outcomes: [...OUTCOMES],
    activity: [],
    approvals: [],
    running: [],
    assembledFor: null,
  }

  /* -------------------------- plumbing --------------------------- */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.state
  private set(patch: Partial<DemoState>) {
    this.state = { ...this.state, ...patch }
    this.persist()
    this.listeners.forEach((l) => l())
  }

  /* ------------------------ persistence -------------------------- */
  /** Called once from the client after mount (see useDemoWorkforce). */
  hydrate() {
    if (this.hydrated || typeof window === "undefined") return
    this.hydrated = true
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<DemoState>
      this.state = {
        ...this.state,
        // only restore evolving data; keep seed for structure
        skills: saved.skills?.length ? saved.skills : this.state.skills,
        outcomes: saved.outcomes ?? this.state.outcomes,
        activity: saved.activity ?? [],
        approvals: (saved.approvals ?? []).filter((a) => a.status !== "pending"),
        workers: saved.workers?.length ? saved.workers.map((w) => ({ ...w, state: "idle" as WorkerState })) : this.state.workers,
        assembledFor: saved.assembledFor ?? null,
        running: [],
      }
      this.listeners.forEach((l) => l())
    } catch {
      /* corrupt payload — ignore and keep seed */
    }
  }

  private persist() {
    if (typeof window === "undefined") return
    try {
      const { skills, outcomes, activity, approvals, workers, assembledFor } = this.state
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ skills, outcomes, activity: activity.slice(0, 30), approvals: approvals.slice(0, 20), workers, assembledFor }),
      )
    } catch {
      /* quota / unavailable — non-fatal for a demo */
    }
  }

  reset() {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY)
    this.set({
      workers: WORKERS.map((w) => ({ ...w })),
      skills: SKILLS.map((s) => ({ ...s })),
      outcomes: [...OUTCOMES],
      activity: [],
      approvals: [],
      running: [],
    })
  }

  /* --------------------------- reads ----------------------------- */
  get providerLabel() {
    return this.provider.label
  }
  get isDemoRuntime() {
    return this.provider.isDemo
  }
  worker(id: string) {
    return this.state.workers.find((w) => w.id === id)
  }
  skill(id: string) {
    return this.state.skills.find((s) => s.id === id)
  }
  skillsOf(workerId: string) {
    const w = this.worker(workerId)
    if (!w) return []
    return w.skillIds.map((id) => this.skill(id)).filter(Boolean) as Skill[]
  }
  reportsOf(managerId: string) {
    return this.state.workers.filter((w) => w.managerId === managerId)
  }
  outcomesOf(workerId: string) {
    return this.state.outcomes.filter((o) => o.workerId === workerId)
  }
  activityOf(workerId: string) {
    return this.state.activity.filter((a) => a.workerId === workerId)
  }

  /* ------------------------- mutations --------------------------- */
  setAssembledFor(outcome: string) {
    this.set({ assembledFor: outcome })
  }

  private setWorkerState(workerId: string, state: WorkerState) {
    this.set({
      workers: this.state.workers.map((w) => (w.id === workerId ? { ...w, state } : w)),
    })
  }

  private pushActivity(events: ActivityEvent[]) {
    if (!events.length) return
    this.set({ activity: [...events.reverse(), ...this.state.activity].slice(0, MAX_ACTIVITY) })
  }

  private applyOutcome(outcome: WorkOutcome) {
    this.set({
      outcomes: [outcome, ...this.state.outcomes].slice(0, 40),
      skills: this.state.skills.map((s) => {
        if (s.id !== outcome.skillId) return s
        const proficiency = Math.min(100, s.proficiency + 1)
        return { ...s, runs: s.runs + 1, proficiency, maturity: maturityFor(proficiency) }
      }),
    })
  }

  /* -------------------------- approvals -------------------------- */
  /** Provider-facing: enqueue a request and return a promise that the
   * Approvals surface (or an auto-approval) resolves. */
  private requestApproval(
    workerId: string,
    skillId: string,
    task: string,
    gate: { action: string; reason: string },
    auto: boolean,
  ): Promise<boolean> {
    const req: ApprovalRequest = {
      id: nid("apr"),
      workerId,
      skillId,
      action: gate.action,
      reason: gate.reason,
      task,
      status: "pending",
      requestedAt: Date.now(),
      auto,
    }
    this.set({ approvals: [req, ...this.state.approvals].slice(0, 30) })

    if (auto) {
      return new Promise((res) =>
        setTimeout(() => {
          this.markApproval(req.id, true, true)
          res(true)
        }, 700),
      )
    }
    return new Promise((res) => this.approvalResolvers.set(req.id, res))
  }

  private markApproval(id: string, approved: boolean, auto = false) {
    this.set({
      approvals: this.state.approvals.map((a) =>
        a.id === id ? { ...a, status: approved ? "approved" : "denied", decidedAt: Date.now(), auto: auto || a.auto } : a,
      ),
    })
  }

  /** Called from the Approvals surface. */
  resolveApproval(id: string, approved: boolean) {
    const resolver = this.approvalResolvers.get(id)
    this.markApproval(id, approved)
    if (resolver) {
      this.approvalResolvers.delete(id)
      resolver(approved)
    }
  }

  pendingApprovals() {
    return this.state.approvals.filter((a) => a.status === "pending")
  }

  /* --------------------------- runs ------------------------------ */
  /** Run one of a worker's skills through the provider seam.
   * `autoApprove` grants any gate automatically (used by ambient pulse);
   * otherwise the run blocks until a human decides in /approvals. */
  async runSkill(workerId: string, skillId: string, task: string, opts?: { autoApprove?: boolean }) {
    const worker = this.worker(workerId)
    const skill = this.skill(skillId)
    if (!worker || !skill) return
    if (this.state.running.includes(workerId)) return

    this.set({ running: [...this.state.running, workerId] })
    try {
      for await (const update of this.provider.run({
        worker,
        skill,
        task,
        requestApproval: (gate) => this.requestApproval(workerId, skillId, task, gate, opts?.autoApprove ?? false),
      })) {
        this.pushActivity(update.events)
        this.setWorkerState(workerId, update.state)
        if (update.outcome) this.applyOutcome(update.outcome)
      }
    } finally {
      this.set({ running: this.state.running.filter((id) => id !== workerId) })
    }
  }

  /** Kick a light ambient run across the division for the Observatory.
   * Gates are auto-approved so the pulse never stalls, but they are
   * still recorded in the approvals ledger as auto-decisions. */
  async runDivisionPulse(task: string) {
    const specialists = this.state.workers.filter((w) => w.role === "specialist").slice(0, 3)
    await Promise.all(specialists.map((w) => this.runSkill(w.id, w.skillIds[0], task, { autoApprove: true })))
  }

  /* --------------------------- evolve ---------------------------- */
  /** Apply an evolve recommendation — this is the division improving. */
  applyEvolve(rec: EvolveRecommendation) {
    if (rec.kind === "promote_skill") {
      this.set({
        skills: this.state.skills.map((s) => {
          if (s.id !== rec.skillId) return s
          const bands: SkillMaturity[] = ["seed", "practiced", "expert", "mastered"]
          const nextIdx = Math.min(bands.length - 1, bands.indexOf(s.maturity) + 1)
          const next = bands[nextIdx]
          const proficiency = Math.max(s.proficiency, SKILL_MATURITY_META[next].min)
          return { ...s, proficiency, maturity: next }
        }),
      })
      const w = this.worker(rec.workerId)
      this.pushActivity([
        { id: nid("act"), workerId: rec.workerId, kind: "learned", text: `${w?.name ?? "Worker"} promoted — ${rec.title}.`, skillId: rec.skillId, at: Date.now() },
      ])
      return
    }

    if (rec.kind === "promote_heuristic") {
      this.set({
        skills: this.state.skills.map((s) =>
          s.id === rec.skillId
            ? { ...s, heuristics: s.heuristics.map((h, i) => (i === 0 ? { ...h, confidence: Math.min(0.99, h.confidence + 0.03) } : h)) }
            : s,
        ),
      })
      const w = this.worker(rec.workerId)
      this.pushActivity([
        { id: nid("act"), workerId: rec.workerId, kind: "learned", text: `${w?.name ?? "Worker"} standardized a heuristic — ${rec.title}.`, skillId: rec.skillId, at: Date.now() },
      ])
      return
    }

    if (rec.kind === "transfer_skill" && rec.toWorkerId) {
      const source = this.skill(rec.skillId)
      const target = this.worker(rec.toWorkerId)
      if (!source || !target || target.skillIds.includes(source.id)) return
      const copy: Skill = {
        ...source,
        id: nid("skill"),
        proficiency: SKILL_MATURITY_META.practiced.min + 5,
        maturity: "practiced",
        runs: Math.round(source.runs * 0.1),
        inheritedFrom: rec.workerId,
      }
      this.set({
        skills: [...this.state.skills, copy],
        workers: this.state.workers.map((w) => (w.id === target.id ? { ...w, skillIds: [...w.skillIds, copy.id] } : w)),
      })
      this.pushActivity([
        { id: nid("act"), workerId: rec.toWorkerId, kind: "learned", text: `${target.name} inherited ${source.name} IP from ${this.worker(rec.workerId)?.name ?? "a peer"}.`, skillId: copy.id, at: Date.now() },
      ])
    }
  }
}

export const demoStore = new DemoStore()

/* server snapshot is stable so SSR + first client render agree */
const SERVER_SNAPSHOT: DemoState = {
  division: DIVISION,
  workers: WORKERS,
  skills: SKILLS,
  outcomes: OUTCOMES,
  activity: [],
  approvals: [],
  running: [],
  assembledFor: null,
}

export function useDemoWorkforce(): DemoState {
  const state = useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot, () => SERVER_SNAPSHOT)
  useEffect(() => {
    demoStore.hydrate()
  }, [])
  return state
}

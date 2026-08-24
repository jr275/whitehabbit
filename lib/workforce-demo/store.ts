"use client"

/* ================================================================== *
 * DEMO WORKFORCE STORE
 *
 * A small external store (useSyncExternalStore) that owns the demo
 * division: workers, skills, outcomes, and a live activity feed. Runs
 * are executed through the ExecutionProvider seam so the UI never
 * touches provider internals. State is in-memory (session-scoped) —
 * a real store would persist to the backend.
 * ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react"
import { demoExecutionProvider } from "./execution"
import type { ActivityEvent, DemoWorker, Division, ExecutionProvider, Skill, WorkOutcome, WorkerState } from "./model"
import { DIVISION, OUTCOMES, SKILLS, WORKERS } from "./seed"

export interface DemoState {
  division: Division
  workers: DemoWorker[]
  skills: Skill[]
  outcomes: WorkOutcome[]
  activity: ActivityEvent[]
  /** worker ids currently mid-run */
  running: string[]
  /** the outcome the current division was assembled around (from homepage) */
  assembledFor: string | null
}

const MAX_ACTIVITY = 60

class DemoStore {
  private provider: ExecutionProvider = demoExecutionProvider
  private listeners = new Set<() => void>()
  private state: DemoState = {
    division: DIVISION,
    workers: WORKERS.map((w) => ({ ...w })),
    skills: SKILLS.map((s) => ({ ...s })),
    outcomes: [...OUTCOMES],
    activity: [],
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
    this.listeners.forEach((l) => l())
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
    // record the outcome and reinforce the skill it came from
    this.set({
      outcomes: [outcome, ...this.state.outcomes].slice(0, 40),
      skills: this.state.skills.map((s) =>
        s.id === outcome.skillId
          ? { ...s, runs: s.runs + 1, proficiency: Math.min(100, s.proficiency + 1) }
          : s,
      ),
    })
  }

  /** Run one of a worker's skills through the provider seam. */
  async runSkill(workerId: string, skillId: string, task: string) {
    const worker = this.worker(workerId)
    const skill = this.skill(skillId)
    if (!worker || !skill) return
    if (this.state.running.includes(workerId)) return

    this.set({ running: [...this.state.running, workerId] })
    try {
      for await (const update of this.provider.run({ worker, skill, task })) {
        this.pushActivity(update.events)
        this.setWorkerState(workerId, update.state)
        if (update.outcome) this.applyOutcome(update.outcome)
      }
    } finally {
      this.set({ running: this.state.running.filter((id) => id !== workerId) })
    }
  }

  /** Kick a light ambient run across the division for the Observatory. */
  async runDivisionPulse(task: string) {
    const specialists = this.state.workers.filter((w) => w.role === "specialist").slice(0, 3)
    await Promise.all(
      specialists.map((w) => this.runSkill(w.id, w.skillIds[0], task)),
    )
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
  running: [],
  assembledFor: null,
}

export function useDemoWorkforce(): DemoState {
  return useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot, () => SERVER_SNAPSHOT)
}

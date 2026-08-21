/* ================================================================== *
 * WORKFORCE PERSISTENCE — localStorage snapshot.
 * Same durable-facts-only rule as the legacy worker store: outputs are
 * capped so history can't grow unbounded in the browser.
 * ================================================================== */

import type { Worker, WorkerExecution, WorkerOutput, WorkerTask } from "./model"

const KEY = "whitehabbit.workforce.v1"
const MAX_OUTPUTS = 600
const MAX_TASKS = 400

export interface PersistedWorkforce {
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
}

export function loadWorkforce(): PersistedWorkforce | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedWorkforce
    if (!parsed || !Array.isArray(parsed.workers)) return null
    return {
      workers: parsed.workers ?? [],
      tasks: parsed.tasks ?? [],
      executions: parsed.executions ?? [],
      outputs: parsed.outputs ?? [],
    }
  } catch (err) {
    console.log("[v0] failed to load workforce state", err)
    return null
  }
}

export function saveWorkforce(state: PersistedWorkforce) {
  if (typeof window === "undefined") return
  try {
    const trimmed: PersistedWorkforce = {
      workers: state.workers,
      tasks: state.tasks.slice(0, MAX_TASKS),
      executions: state.executions.slice(0, MAX_TASKS),
      outputs: state.outputs.slice(0, MAX_OUTPUTS),
    }
    window.localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch (err) {
    console.log("[v0] failed to save workforce state", err)
  }
}

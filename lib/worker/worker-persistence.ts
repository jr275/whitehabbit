/* ================================================================== *
 * WORKER PERSISTENCE — localStorage snapshot of durable state.
 *
 * Only durable facts are persisted (the worker, its version, and the
 * completed run history). Transient runtime state (in-flight timers,
 * the active running task) is intentionally NOT persisted — on reload
 * the worker and its history remain, but a half-finished run does not.
 * ================================================================== */

import type { RunResult, Worker } from "./worker-model"

const KEY = "whitehabbit.worker.v1"

export interface PersistedState {
  worker: Worker | null
  history: RunResult[]
}

export function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed || typeof parsed !== "object") return null
    return { worker: parsed.worker ?? null, history: parsed.history ?? [] }
  } catch (err) {
    console.log("[v0] failed to load worker state", err)
    return null
  }
}

export function saveState(state: PersistedState) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch (err) {
    console.log("[v0] failed to save worker state", err)
  }
}

export function clearState() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(KEY)
  } catch (err) {
    console.log("[v0] failed to clear worker state", err)
  }
}

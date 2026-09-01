/* ================================================================== *
 * INGESTION STATE MACHINE
 *
 * Two state machines, deliberately kept separate:
 *
 *   OBJECT status  — what the user sees. Where is my article?
 *   JOB status     — what the runner sees. What work is outstanding?
 *
 * RETRYING is evaluated and rejected as an object state. Retry is a
 * property of the WORK, not of the article: it lives on the job as
 * `attempt` + `run_after`. Putting it on the object would duplicate
 * job state in a second place and create an ambiguity — an object
 * showing "retrying" tells the user nothing they can act on, while an
 * object that stays `pending` with a job quietly backing off is both
 * simpler and truthful.
 *
 * Pure module — no I/O — so transitions are directly unit testable.
 * ================================================================== */

/** What the user sees. */
export const OBJECT_STATUSES = ["pending", "fetching", "extracting", "completed", "failed"] as const
export type ObjectStatus = (typeof OBJECT_STATUSES)[number]

/** What the runner sees. */
export const JOB_STATUSES = ["pending", "active", "completed", "failed"] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const TERMINAL_OBJECT_STATUSES: readonly ObjectStatus[] = ["completed", "failed"]

/**
 * Valid object transitions.
 *
 *   pending ──► fetching ──► extracting ──► completed
 *      ▲           │             │
 *      │           ▼             ▼
 *      │        failed ◄─────────┘
 *      └──────────┘   (an explicit retry re-arms a failed object)
 *
 * A transition back to `pending` from `fetching`/`extracting` is legal
 * and is how the reaper recovers a job whose worker died mid-flight.
 */
const OBJECT_TRANSITIONS: Record<ObjectStatus, readonly ObjectStatus[]> = {
  pending: ["fetching", "failed"],
  fetching: ["extracting", "failed", "pending"],
  extracting: ["completed", "failed", "pending"],
  completed: [],
  failed: ["pending"],
}

const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  pending: ["active", "failed"],
  active: ["completed", "failed", "pending"],
  completed: [],
  failed: ["pending"],
}

export function canTransitionObject(from: ObjectStatus, to: ObjectStatus): boolean {
  return OBJECT_TRANSITIONS[from].includes(to)
}

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to)
}

export function isTerminalObjectStatus(status: ObjectStatus): boolean {
  return TERMINAL_OBJECT_STATUSES.includes(status)
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Illegal ingestion transition: ${from} -> ${to}`)
    this.name = "InvalidTransitionError"
  }
}

export function assertObjectTransition(from: ObjectStatus, to: ObjectStatus): void {
  if (!canTransitionObject(from, to)) throw new InvalidTransitionError(from, to)
}

/* ---- retry policy ------------------------------------------------ */

export const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 30_000

/**
 * Exponential backoff with jitter: 30s, 60s, 120s (+/-20%).
 *
 * Jitter matters even at this scale — without it, a publisher that
 * rate-limits us produces a thundering herd of retries that all land
 * in the same second and get rate-limited again.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1)
  const jitter = 1 + (random() * 0.4 - 0.2)
  return Math.round(base * jitter)
}

/** Failure codes that are worth trying again. */
const RETRYABLE = new Set(["timeout", "http_5xx", "network_error", "dns_failure", "extraction_error"])

/**
 * A blocked address, a 404 or an unsupported content type are
 * determinate answers — retrying them burns capacity and delays the
 * honest failure the user needs to see.
 */
export function isRetryable(failureCode: string): boolean {
  return RETRYABLE.has(failureCode)
}

export function shouldRetry(failureCode: string, attempt: number, maxAttempts = MAX_ATTEMPTS): boolean {
  return isRetryable(failureCode) && attempt < maxAttempts
}

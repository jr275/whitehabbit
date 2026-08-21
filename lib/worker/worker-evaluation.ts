/* ================================================================== *
 * WORKER EVALUATION — derives proposals from execution history.
 *
 * next-best-action after a run, memory proposals, and evolution
 * analysis over the whole run history. All deterministic; the
 * architecture allows a learning backend to replace this later.
 * ================================================================== */

import type { RunResult, Worker } from "./worker-model"

/** Propose the follow-up task after a completed run. */
export function nextBestAction(run: RunResult): string {
  const company = extractCompany(run.objective)
  if (run.decision === "QUALIFIED") {
    return `Identify the economic buyer at ${company}.`
  }
  if (run.decision === "NOT_QUALIFIED") {
    return `Find a better-fit account similar to ${company}.`
  }
  return `Gather more evidence on ${company}.`
}

/** Propose a memory the worker could form from this run. */
export function proposeMemory(run: RunResult): { text: string; confidence: number } | null {
  if (run.status !== "complete") return null
  if (run.decision === "QUALIFIED" && (run.confidence ?? 0) >= 85) {
    return {
      text: "Accounts with strong hiring signals and technology fit qualify at high confidence.",
      confidence: Math.min(92, 78 + Math.round((run.confidence ?? 80) / 12)),
    }
  }
  if (run.decision === "NOT_QUALIFIED") {
    return {
      text: "Weak budget signals are the strongest predictor of a non-qualified account.",
      confidence: 81,
    }
  }
  return null
}

export interface Evolution {
  capability: string
  successRate: number
  proposal: string
  expectedImprovement: number
}

/**
 * Analyze run history and, once there is enough signal, propose an
 * evolution to the weakest capability.
 */
export function analyzeHistory(worker: Worker, history: RunResult[]): Evolution | null {
  const completed = history.filter((r) => r.status === "complete" || r.status === "rejected")
  if (completed.length < 3) return null

  // communication is the interesting weak point in the demo model
  const comm = worker.capabilities.find((c) => c.name.toLowerCase() === "communication")
  if (!comm || !comm.enabled) return null

  const rejected = history.filter((r) => r.status === "rejected").length
  const successRate = Math.max(
    55,
    Math.round(((completed.length - rejected) / completed.length) * 100) - 12,
  )
  if (successRate >= 88) return null

  return {
    capability: "Communication",
    successRate,
    proposal: "Use shorter, more contextual enterprise outreach.",
    expectedImprovement: 12,
  }
}

/** Deterministic "teaching" — maps known instructions to config changes. */
export interface TeachResult {
  policy?: string
  memory?: { text: string; confidence: number }
  note: string
}

export function interpretTeaching(text: string): TeachResult {
  const t = text.toLowerCase()
  if (/vp|director|decision maker|seniority|title/.test(t)) {
    return {
      policy: "Prioritize VP and Director-level contacts at enterprise accounts.",
      memory: {
        text: "VP and Director contacts convert at a higher rate for enterprise deals.",
        confidence: 83,
      },
      note: "Added a targeting policy and a supporting memory.",
    }
  }
  if (/short|concise|brief|length/.test(t)) {
    return {
      memory: {
        text: "Short enterprise outreach has a higher response probability.",
        confidence: 84,
      },
      note: "Formed a new memory about outreach length.",
    }
  }
  if (/confiden|threshold|%|approval/.test(t)) {
    return {
      policy: text.trim(),
      note: "Added a new policy rule.",
    }
  }
  // generic: treat the instruction as a custom policy
  return {
    policy: text.trim(),
    note: "Added your instruction as a policy.",
  }
}

export function extractCompany(objective: string): string {
  // pull a Proper-Noun-ish token out of the objective
  const m = objective.match(/(?:research|about|on|at|for)\s+([A-Z][\w&.-]+(?:\s[A-Z][\w&.-]+)?)/)
  if (m) return m[1]
  const caps = objective.match(/[A-Z][\w&.-]+/g)
  return caps?.[0] ?? "the account"
}

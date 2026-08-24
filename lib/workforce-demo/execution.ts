/* ================================================================== *
 * DEMO EXECUTION PROVIDER
 *
 * The ONLY place that produces a worker's run in the demo layer. It
 * implements the ExecutionProvider seam from ./model — the UI depends
 * on that interface alone, so a real runtime (streaming from the
 * agent backend) can drop in later with zero UI changes.
 *
 * Everything here is deterministic and clearly synthetic. It does not
 * call, mock, or impersonate any real external system. Timings are
 * simulated; the honesty rule (no fake "live" external calls) is kept
 * by labeling this provider `isDemo` and surfacing that in the UI.
 * ------------------------------------------------------------------ */

import type {
  ActivityEvent,
  DemoWorker,
  ExecutionProvider,
  ExecutionUpdate,
  Skill,
  WorkOutcome,
  WorkerState,
} from "./model"
import { HIGH_RISK_PERMISSIONS } from "@/lib/workforce/model"

let seq = 0
function eid() {
  seq += 1
  return `act-${Date.now()}-${seq}`
}

function ev(workerId: string, kind: ActivityEvent["kind"], text: string, skillId?: string): ActivityEvent {
  return { id: eid(), workerId, kind, text, skillId, at: Date.now() }
}

/** A tiny deterministic PRNG so the same worker+skill+task always
 * yields the same run — demos must be repeatable. */
function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/** Derives the run's headline outcome from the skill's own IP + a
 * seeded roll, so it reads as a real consequence of this skill. */
function deriveOutcome(worker: DemoWorker, skill: Skill, task: string, roll: number): WorkOutcome {
  const magnitude = Math.round(6 + roll * 22) // 6..28
  const up = skill.category !== "sales" // sales skill improves a "cost" metric (goes down)
  const metricByCat: Record<string, string> = {
    research: "Demand lead time",
    content: "Message → conversion",
    communication: "Lead → SQL rate",
    sales: "Blended CAC",
  }
  const metric = metricByCat[skill.category] ?? worker.primaryKpi
  const delta = up ? `+${magnitude}%` : `−${magnitude}%`
  const valueUsd = Math.round((10 + roll * 90) * 1000)
  return {
    id: eid(),
    workerId: worker.id,
    skillId: skill.id,
    metric,
    delta,
    tone: up ? "up" : "down",
    summary: `${skill.name} run on "${task.slice(0, 48)}${task.length > 48 ? "…" : ""}" — ${
      up ? "moved" : "reduced"
    } ${metric.toLowerCase()} by applying ${skill.heuristics[0]?.then ?? "its learned playbook"}.`,
    valueUsd,
    at: new Date().toISOString().slice(0, 10),
  }
}

/** Whether this skill's recipe touches a high-risk tool that would
 * make a real worker pause for approval. Keeps the demo honest about
 * where a human gate belongs. */
function needsApproval(skill: Skill): boolean {
  return skill.recipe.some((s) => /approval|publish|financial|budget|send/i.test(`${s.action} ${s.tool ?? ""}`))
}

export const demoExecutionProvider: ExecutionProvider = {
  label: "Demo runtime (deterministic)",
  isDemo: true,

  async *run({ worker, skill, task, requestApproval }): AsyncGenerator<ExecutionUpdate> {
    const roll = hash(`${worker.id}:${skill.id}:${task}`)
    const gate = needsApproval(skill)

    let state: WorkerState = "working"
    yield {
      events: [ev(worker.id, "run_started", `${worker.name} started ${skill.name}.`, skill.id)],
      state,
      done: false,
    }
    await sleep(420)

    // stream the recipe steps
    for (let i = 0; i < skill.recipe.length; i++) {
      const s = skill.recipe[i]
      const batch: ActivityEvent[] = [ev(worker.id, "step", s.action, skill.id)]

      // an insight lands roughly a third of the way in
      if (i === Math.floor(skill.recipe.length / 3)) {
        const heur = skill.heuristics[0]
        if (heur) batch.push(ev(worker.id, "insight", `Applied heuristic: when ${heur.when.toLowerCase()}, ${heur.then}.`, skill.id))
      }

      // pause for approval before the gated step
      const gatedStep = gate && /approval|publish|financial|budget|send/i.test(`${s.action} ${s.tool ?? ""}`)
      if (gatedStep) {
        state = "blocked"
        const reason = `High-risk action: "${s.action}"${s.tool ? ` via ${s.tool}` : ""}.`
        batch.push(ev(worker.id, "blocked", `${worker.name} paused — "${s.action}" needs a human decision.`, skill.id))
        yield { events: batch, state, done: false }

        // Ask the human through the seam. Without a handler (e.g. a
        // detached run) we fall back to proceeding after a beat.
        let approved = true
        if (requestApproval) {
          approved = await requestApproval({ action: s.action, reason })
        } else {
          await sleep(900)
        }

        if (!approved) {
          state = "idle"
          yield {
            events: [ev(worker.id, "blocked", `${worker.name} stopped — "${s.action}" was denied. No changes made.`, skill.id)],
            state,
            done: true,
          }
          return
        }

        state = "working"
        yield {
          events: [ev(worker.id, "step", `Approved — resuming "${s.action}".`, skill.id)],
          state,
          done: false,
        }
        await sleep(500)
        continue
      }

      yield { events: batch, state, done: false }
      await sleep(Math.max(260, s.seconds * 55))
    }

    // occasionally the worker learns something new
    if (roll > 0.55) {
      state = "learning"
      yield {
        events: [ev(worker.id, "learned", `${worker.name} reinforced a heuristic — confidence on "${skill.heuristics[0]?.when ?? skill.name}" rose.`, skill.id)],
        state,
        done: false,
      }
      await sleep(500)
    }

    const outcome = deriveOutcome(worker, skill, task, roll)
    state = "idle"
    yield {
      events: [
        ev(worker.id, "outcome", `${outcome.metric} ${outcome.delta} — ${outcome.summary}`, skill.id),
        ev(worker.id, "run_completed", `${worker.name} completed ${skill.name}.`, skill.id),
      ],
      state,
      outcome,
      done: true,
    }
  },
}

/* Re-exported so callers don't reach into the real model directly for
 * this one check. */
export { HIGH_RISK_PERMISSIONS }

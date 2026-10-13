"use client"

/* ================================================================== *
 * THE RUN — what replaced a single "Retrieving" spinner.
 *
 * The spinner was not just sparse, it was misleading: retrieval,
 * weighing the evidence, generation and citation checking take very
 * different amounts of time, and one of them (generation) does not
 * happen at all when the library has no evidence. A single spinner
 * made a refusal look like a slow answer right up until the text
 * appeared.
 *
 * EVERY LINE HERE IS A REPORTED FACT. The step statuses come from
 * STEP_STARTED/STEP_FINISHED, the counts from the pipeline's own
 * CUSTOM payloads, the durations from the two timestamps the events
 * carry. There is no estimated progress, no percentage and no
 * fabricated duration — if the server did not send it, it is not
 * shown. A step the run never reached reads as "not needed" rather
 * than as pending forever.
 *
 * RENDERED TWICE, DELIBERATELY. While a run is live this is the
 * assistant's turn. Once the answer arrives it is folded into the
 * answer's provenance block, closed (see RetrievalNote in
 * ./ask-view.tsx) — because the record of how an answer was produced
 * used to be destroyed the moment it was produced. It takes no
 * question and renders no Stop: the question is shown once, as the
 * turn above it, and stopping is the composer's button.
 *
 * ACCESSIBILITY. A concise live region announces each stage as it
 * completes rather than silence followed by an answer. Status is
 * carried in TEXT as well as icon and colour, so it survives both
 * colour blindness and a stylesheet that fails to load.
 * ================================================================== */

import { AlertTriangle, Check, Circle, Loader2, Minus } from "lucide-react"

import type { Dictionary } from "@/lib/knowledge/i18n/dictionary"
import type { AskRunState, AskStepState } from "@/lib/knowledge/ask-run"
import { useT } from "../i18n"

/**
 * How long a step took, from the stream's own two timestamps.
 *
 * Both come from one clock — the server emits every event with its own
 * Date.now() (lib/knowledge/agui.ts) — so the difference is a real
 * server-side duration and not a measure of the network. It is shown
 * only when BOTH numbers really arrived and the result is sane:
 * reduceAskEvent copies event.timestamp through without trusting it,
 * because the reducer is fed by JSON.parse over a socket, so a missing
 * or negative value here is possible and renders as nothing rather
 * than as "NaNms".
 */
function stepDuration(step: AskStepState): string | null {
  const { startedAt, finishedAt } = step
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return null
  const ms = (finishedAt as number) - (startedAt as number)
  if (!Number.isFinite(ms) || ms < 0) return null
  return ms < 1_000 ? `${Math.round(ms)}ms` : `${(ms / 1_000).toFixed(1)}s`
}

/** The one-line detail under a step, built only from values the
 *  pipeline actually reported. Returns null when there is nothing
 *  true to say yet. */
function stepDetail(t: Dictionary, step: AskStepState, run: AskRunState): string | null {
  switch (step.name) {
    case "retrieval": {
      const r = run.retrieval
      if (!r) return null
      const base = t.run.candidates(r.candidates, r.mode)
      return r.semanticSearch ? base : t.run.noEmbeddings(base)
    }
    case "evidence": {
      const e = run.evidence
      if (!e) return null
      if (e.refused) {
        return e.chunksRejected > 0 ? t.run.refusedWithRejects(e.chunksRejected) : t.run.refusedEmpty
      }
      const used = t.run.passagesUsed(e.chunksUsed)
      return e.chunksRejected > 0 ? `${used} · ${t.run.rejected(e.chunksRejected)}` : used
    }
    case "generation": {
      if (run.evidence?.refused) return t.run.generationSkipped
      const u = run.usage
      if (!u) return null
      return t.run.usage(u.model, u.inputTokens, u.outputTokens)
    }
    case "verification": {
      const c = run.citations
      if (!c) return null
      const base = t.run.citationsChecked(c.citations.length)
      return c.unresolvedCitationIds.length > 0
        ? `${base} · ${t.run.unresolved(c.unresolvedCitationIds.length)}`
        : base
    }
    default:
      return null
  }
}

/**
 * One short sentence for the live region.
 *
 * WHY NOT MAKE THE LIST ITSELF LIVE. role="status" on the <ol>
 * overrode its list semantics, so a screen reader stopped announcing
 * it as a list at all — and because the whole subtree was the live
 * region, every step change re-announced all four. A separate concise
 * region announces the transition and leaves the list a list.
 */
function liveAnnouncement(t: Dictionary, run: AskRunState, streaming: boolean): string {
  if (run.phase === "error") return t.run.stoppedWith(run.error?.message ?? "").trim()
  if (run.truncated) return t.run.connectionEnded
  const running = run.steps.find((s) => s.status === "running")
  if (running) return `${t.run.steps[running.name]}…`
  if (run.phase === "finished") return t.run.finished
  return streaming ? t.run.workingEllipsis : ""
}

/** A step the run will never reach is not "waiting" — say so. */
function statusWord(t: Dictionary, step: AskStepState, run: AskRunState): string {
  if (step.status === "pending" && step.name === "generation" && run.evidence?.refused) return t.run.status.notNeeded
  if (step.status === "pending" && step.name === "verification" && run.evidence?.refused) return t.run.status.notNeeded
  switch (step.status) {
    case "pending":
      return run.phase === "running" ? t.run.status.waiting : t.run.status.notReached
    case "running":
      return t.run.status.inProgress
    case "done":
      return t.run.status.done
    case "failed":
      return t.run.status.failed
  }
}

function StepIcon({ step, run }: { step: AskStepState; run: AskRunState }) {
  const skipped = step.status === "pending" && run.evidence?.refused
  if (step.status === "running") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--pk-signal)]" aria-hidden="true" />
  }
  if (step.status === "done") {
    return <Check className="size-3.5 shrink-0 text-[var(--pk-good)]" aria-hidden="true" />
  }
  if (step.status === "failed") {
    return <AlertTriangle className="size-3.5 shrink-0 text-[var(--pk-danger)]" aria-hidden="true" />
  }
  if (skipped) {
    return <Minus className="size-3.5 shrink-0 text-[var(--pk-ink-4)]" aria-hidden="true" />
  }
  return <Circle className="size-3.5 shrink-0 text-[var(--pk-rule-2)]" aria-hidden="true" />
}

export function AskRunTimeline({ run, streaming }: { run: AskRunState; streaming: boolean }) {
  const t = useT()
  return (
    <div className="max-w-[52ch]">
      <p className="pk-label text-[var(--pk-signal)]">
        {run.phase === "error"
          ? t.run.stopped
          : run.truncated
            ? t.run.interrupted
            : streaming
              ? t.run.working
              : t.run.done}
      </p>

      {/* The live region: one sentence, announced as it changes, so a
          screen reader hears each stage instead of silence followed by
          a wall of text. */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveAnnouncement(t, run, streaming)}
      </p>

      {/* A continuous rail behind the markers, so four steps read as
          one sequence rather than four unrelated rows. It is drawn
          per-item and stops at the last one — no absolute overlay to
          misalign when a detail line wraps. */}
      <ol className="mt-5" aria-busy={streaming}>
        {run.steps.map((step, i) => {
          const detail = stepDetail(t, step, run)
          const duration = step.status === "done" ? stepDuration(step) : null
          const last = i === run.steps.length - 1
          return (
            <li key={step.name} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span className="mt-[3px]">
                  <StepIcon step={step} run={run} />
                </span>
                {!last && <span aria-hidden className="mt-1 w-px flex-1 bg-[var(--pk-rule)]" />}
              </span>
              <span className={last ? "min-w-0" : "min-w-0 pb-4"}>
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={
                      step.status === "pending"
                        ? "text-[14px] text-[var(--pk-ink-4)]"
                        : "text-[14px] text-[var(--pk-ink)]"
                    }
                  >
                    {t.run.steps[step.name]}
                  </span>
                  {duration && <span className="pk-meta text-[var(--pk-ink-4)]">{duration}</span>}
                </span>
                {/* The status in words — not only an icon and a colour. */}
                <span className="sr-only">: {statusWord(t, step, run)}</span>
                {detail && (
                  <span className="mt-1 block text-[13px] leading-[1.55] text-[var(--pk-ink-4)]">{detail}</span>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      {run.phase === "error" && run.error && (
        <p className="mt-5 flex items-start gap-2.5 border-l-2 border-[var(--pk-danger)] pl-3.5 text-[14px] leading-[1.6] text-[var(--pk-ink-2)]">
          {run.error.message}
        </p>
      )}

      {/* Truncation is not failure, and is not described as one. */}
      {run.truncated && run.phase !== "error" && (
        <p className="mt-5 border-l-2 border-[var(--pk-rule-2)] pl-3.5 text-[14px] leading-[1.6] text-[var(--pk-ink-3)]">
          {t.run.truncated}
        </p>
      )}
    </div>
  )
}

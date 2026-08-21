"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — EVENT INSPECTOR
 * Click any execution event to open its context. For a decision it
 * reveals the confidence, evidence, signals and rationale — the seed
 * of the future TRACE system.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { X } from "lucide-react"
import type { Decision } from "@/lib/simulation"
import { KIND_META, type WorkerEvent } from "@/lib/worker"

function ts(t: number) {
  const d = new Date(t)
  const p = (n: number) => n.toString().padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function EventInspector({
  event,
  decision,
  onClose,
}: {
  event: WorkerEvent
  decision: Decision | null
  onClose: () => void
}) {
  const showDecision = event.kind === "decision_created" && decision

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.28 }}
      className="pointer-events-auto w-[300px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-border bg-card/85 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground">
          {KIND_META[event.kind].label}
        </span>
        <button
          onClick={onClose}
          aria-label="Close inspector"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-4 py-3.5">
        <p className="font-mono text-[13px] text-foreground">{event.label}</p>
        {event.detail && (
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{event.detail}</p>
        )}
        <div className="mt-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>{ts(event.t)}</span>
          <span className="text-border">/</span>
          <span>#{event.taskId}</span>
        </div>

        {showDecision && (
          <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Decision
              </p>
              <p className="mt-1 text-[13px] font-medium leading-snug">{decision!.verdict}</p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="font-mono text-[18px] leading-none text-grow tabular-nums">
                  {decision!.confidence}%
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Confidence
                </p>
              </div>
              <div>
                <p className="font-mono text-[18px] leading-none text-foreground tabular-nums">
                  {decision!.evidence}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Evidence
                </p>
              </div>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Signals
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {decision!.signals.map((s) => (
                  <li
                    key={s}
                    className="rounded-md bg-secondary/70 px-2 py-1 text-[10px] text-foreground"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Rationale
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {decision!.rationale}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

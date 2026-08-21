"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — OUTCOME CARD
 * Appears when a task completes. Shows the earned outcome AND the
 * causal chain that produced it — the user can see WHY the worker
 * arrived at this result, not just a number. A key differentiator.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { Check } from "lucide-react"
import type { Outcome } from "@/lib/simulation"

export function OutcomeCard({ outcome }: { outcome: Outcome }) {
  return (
    <motion.div
      key={outcome.title}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="pointer-events-auto w-[300px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-grow/40 bg-card/80 backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-grow/20">
          <Check className="h-2.5 w-2.5 text-grow" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-grow">
          Task complete
        </span>
      </div>

      <div className="px-4 py-3.5">
        <p className="text-pretty text-[15px] font-medium leading-snug tracking-tight">
          {outcome.title}
        </p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-[26px] leading-none tracking-tight text-grow tabular-nums">
            {outcome.confidence}%
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {outcome.kind}
          </span>
        </div>

        {/* causality — read top-down: this exists because of that */}
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Why this outcome
          </p>
          <ol className="mt-2">
            {outcome.causal.map((link, i) => (
              <li key={`${link.label}-${i}`} className="relative pl-4">
                {i < outcome.causal.length - 1 && (
                  <span className="absolute left-[3px] top-3 h-full w-px bg-border" />
                )}
                <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-primary/70" />
                <div className="pb-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground">
                    {link.label}
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{link.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </motion.div>
  )
}

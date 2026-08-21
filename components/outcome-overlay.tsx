"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — OUTCOME
 * The highest zoom level. The fabric recedes; meaning takes over.
 * Not dashboard cards — spatial typography. What the worker is FOR.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { OUTCOMES, type Worker } from "@/lib/worker"

export function OutcomeOverlay({ worker }: { worker: Worker }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6"
    >
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-14 font-mono text-[11px] uppercase tracking-[0.35em] text-muted-foreground"
      >
        {worker.name} · Lifetime outcome
      </motion.p>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-x-16 gap-y-12 sm:grid-cols-2">
        {OUTCOMES.map((o, i) => (
          <motion.div
            key={o.label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08, ease: "easeOut", duration: 0.5 }}
            className={i % 2 === 0 ? "text-left" : "text-right"}
          >
            <div className="text-6xl font-medium tracking-tight text-balance sm:text-7xl">
              {o.value}
            </div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              {o.label}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

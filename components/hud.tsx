"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — HUD
 * Extremely minimal. Floats above the fabric. Shows only identity and
 * liveness; everything else is contextual.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import type { Worker } from "@/lib/worker"

export function Hud({
  worker,
  activeCount,
  live,
}: {
  worker: Worker
  activeCount: number
  live: boolean
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 py-4 sm:px-7"
    >
      {/* left — brand */}
      <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
        WhiteHabbit
      </div>

      {/* center — worker identity */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium tracking-tight">
            {worker.name} · {worker.role}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${live ? "animate-blink bg-grow" : "bg-muted-foreground"}`}
          />
          {live ? "Live" : "Idle"}
          <span className="text-border">/</span>
          <span>Lvl {worker.level}</span>
        </div>
      </div>

      {/* right — active tasks */}
      <div className="text-right font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="text-foreground">Active {activeCount}</span>
      </div>
    </motion.header>
  )
}

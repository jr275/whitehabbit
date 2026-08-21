"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — HUD
 * Extremely minimal. Floats above the fabric. Shows only identity and
 * liveness; everything else is contextual.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import type { Worker, WorkerStatus } from "@/lib/worker"

const STATUS_LABEL: Record<WorkerStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  live: "Live",
  working: "Working",
  idle: "Idle",
  thinking: "Thinking",
}

export function Hud({
  worker,
  activeCount,
  status,
  onActiveClick,
  queueOpen,
}: {
  worker: Worker
  activeCount: number
  status: WorkerStatus
  onActiveClick: () => void
  queueOpen: boolean
}) {
  const busy = status === "working" || status === "thinking"
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
            className={`h-1.5 w-1.5 rounded-full ${
              status === "working"
                ? "animate-blink bg-grow"
                : status === "thinking"
                  ? "animate-pulse bg-primary"
                  : "bg-muted-foreground"
            }`}
          />
          {STATUS_LABEL[status]}
          <span className="text-border">/</span>
          <span>Lvl {worker.level}</span>
        </div>
      </div>

      {/* right — active tasks (click to open the queue) */}
      <button
        onClick={onActiveClick}
        aria-expanded={queueOpen}
        className="pointer-events-auto rounded-md px-1.5 py-1 text-right font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className={`inline-flex items-center gap-1.5 ${busy ? "text-foreground" : ""}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-grow animate-blink" : "bg-muted-foreground/50"}`} />
          Active {activeCount}
        </span>
      </button>
    </motion.header>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — TASK QUEUE
 * A compact spatial list (not a table) showing the one running task
 * and what the worker will autonomously pick up next.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import type { QueuedTask } from "@/lib/simulation"

export function TaskQueue({ queue }: { queue: QueuedTask[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      className="pointer-events-auto w-[260px] overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur-xl"
    >
      <div className="border-b border-border/70 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        Active tasks
      </div>
      <ul className="p-1.5">
        {queue.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-secondary/60"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                t.state === "running" ? "bg-grow animate-blink" : "bg-muted-foreground/50"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-tight">{t.company}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                #{t.id} · {t.objective}
              </p>
            </div>
            <span
              className={`font-mono text-[9px] uppercase tracking-[0.18em] ${
                t.state === "running" ? "text-grow" : "text-muted-foreground/70"
              }`}
            >
              {t.state}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

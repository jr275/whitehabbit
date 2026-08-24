"use client"

/* ------------------------------------------------------------------ *
 * ActivityFeed — the division's live pulse. Streams ActivityEvents
 * from the demo store, newest first, kind-coded. This is the "watch
 * the workforce work" surface: steps, insights, outcomes, blocks and
 * learning all flow through here in real time.
 * ------------------------------------------------------------------ */

import { AnimatePresence, motion } from "framer-motion"
import type { ActivityEvent, ActivityKind, DemoWorker } from "@/lib/workforce-demo/model"

const KIND_META: Record<ActivityKind, { dot: string; label: string }> = {
  run_started: { dot: "var(--color-muted-foreground)", label: "Start" },
  step: { dot: "var(--color-primary)", label: "Step" },
  insight: { dot: "var(--color-primary)", label: "Insight" },
  outcome: { dot: "var(--color-grow)", label: "Outcome" },
  blocked: { dot: "var(--color-warn)", label: "Blocked" },
  learned: { dot: "var(--color-grow)", label: "Learned" },
  run_completed: { dot: "var(--color-muted-foreground)", label: "Done" },
}

function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return `${s}s`
  return `${Math.round(s / 60)}m`
}

export function ActivityFeed({
  activity,
  workers,
}: {
  activity: ActivityEvent[]
  workers: DemoWorker[]
}) {
  const byId = new Map(workers.map((w) => [w.id, w]))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
          Live activity
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Streaming
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {activity.length === 0 && (
          <p className="px-3 py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
            The division is idle. Trigger a division pulse to watch your
            workforce go to work.
          </p>
        )}
        <AnimatePresence initial={false}>
          {activity.map((e) => {
            const meta = KIND_META[e.kind]
            const w = byId.get(e.workerId)
            return (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex gap-2.5 rounded-md px-2.5 py-2 hover:bg-secondary/40"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: meta.dot }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {w?.name ?? "Worker"}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {ago(e.at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {e.text}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

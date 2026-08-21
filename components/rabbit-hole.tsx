"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — RABBIT HOLE (immersive trace)
 * Not a panel — an environment. The interface becomes dense and
 * technical. Monospace metadata. Real execution events. You are
 * inside the worker.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { KIND_META, type WorkerEvent } from "@/lib/worker"

function ts(t: number) {
  const d = new Date(t)
  const p = (n: number) => n.toString().padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const TONE: Record<string, string> = {
  alive: "text-primary",
  grow: "text-grow",
  warn: "text-warn",
  muted: "text-muted-foreground",
}

export function RabbitHole({
  log,
  query,
}: {
  log: WorkerEvent[]
  query: string
}) {
  const filtered = query.trim()
    ? log.filter((e) =>
        `${e.label} ${e.detail ?? ""} ${e.taskId}`.toLowerCase().includes(query.toLowerCase()),
      )
    : log

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="pointer-events-none absolute inset-0 z-10 flex justify-end"
    >
      {/* darkening vignette so internals feel deeper */}
      <div className="absolute inset-0 bg-background/45" />

      <div className="pointer-events-auto relative flex h-full w-full max-w-md flex-col border-l border-border bg-background/85 backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground">
            WH::TRACE
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {filtered.length} events
          </span>
        </div>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-3 font-mono text-[11px] leading-relaxed">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No matching events.</p>
          )}
          {filtered.map((e) => {
            const meta = KIND_META[e.kind]
            return (
              <div key={e.id} className="border-b border-border/40 py-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-muted-foreground">{ts(e.t)}</span>
                  <span className="text-muted-foreground/60">#{e.taskId}</span>
                  <span className={`ml-auto ${TONE[meta.tone]}`}>{meta.label}</span>
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-foreground">{e.label}</span>
                </div>
                {e.detail && <div className="mt-0.5 text-muted-foreground/80">{e.detail}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

"use client"

import { KIND_META, type WorkerEvent } from "@/lib/worker"

function fmt(t: number) {
  const d = new Date(t)
  const p = (n: number) => n.toString().padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const TONE_CLASS: Record<string, string> = {
  alive: "text-primary",
  grow: "text-grow",
  warn: "text-warn",
  muted: "text-muted-foreground",
}
const DOT_CLASS: Record<string, string> = {
  alive: "bg-primary",
  grow: "bg-grow",
  warn: "bg-warn",
  muted: "bg-muted-foreground",
}

export function TraceStream({ log }: { log: WorkerEvent[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Trace
        </h2>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-grow">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-grow" />
          live
        </span>
      </div>

      <p className="px-5 pb-3 text-[12px] leading-relaxed text-muted-foreground">
        Every mark on the fabric maps to a real event below. Beauty for emotion, accuracy for trust.
      </p>

      <ol className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {log.map((e) => {
          const meta = KIND_META[e.kind]
          return (
            <li
              key={e.id}
              className="flex gap-3 border-l border-border/60 py-2 pl-3 font-mono text-[11px]"
            >
              <span className="tabular-nums text-muted-foreground/70">{fmt(e.t)}</span>
              <span className={`flex items-center gap-1.5 ${TONE_CLASS[meta.tone]}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[meta.tone]}`} />
                {e.label}
              </span>
              {e.detail && (
                <span className="truncate text-muted-foreground/80" title={e.detail}>
                  {e.detail}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

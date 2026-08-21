"use client"

import { TriangleAlert } from "lucide-react"
import { type Capability, type CapabilityId } from "@/lib/worker"

function Bar({ value, warning }: { value: number; warning?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full ${warning ? "bg-warn" : "bg-primary"}`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export function CapabilityPanel({
  caps,
  activeCap,
  onHover,
}: {
  caps: Capability[]
  activeCap: CapabilityId | null
  onHover: (id: CapabilityId | null) => void
}) {
  const weakest = [...caps].sort((a, b) => a.score - b.score)[0]

  return (
    <section className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Capabilities
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">{caps.length} active</span>
      </div>

      <ul className="flex flex-col gap-3.5">
        {caps.map((c: Capability) => {
          const live = activeCap === c.id
          return (
            <li
              key={c.id}
              onMouseEnter={() => onHover(c.id)}
              onMouseLeave={() => onHover(null)}
              className={`rounded-lg border px-3 py-2.5 transition-colors ${
                live ? "border-primary/40 bg-primary/5" : "border-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm">
                  {c.name}
                  {c.warning && <TriangleAlert className="h-3.5 w-3.5 text-warn" aria-label="needs attention" />}
                </span>
                <span
                  className={`font-mono text-sm tabular-nums ${c.warning ? "text-warn" : "text-foreground"}`}
                >
                  {c.score}
                </span>
              </div>
              <div className="mt-2">
                <Bar value={c.score} warning={c.warning} />
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto rounded-lg border border-border/70 bg-card/60 p-3.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Insight
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-pretty">
          <span className={`font-medium ${weakest.warning ? "text-warn" : "text-foreground"}`}>
            {weakest.name}
          </span>{" "}
          is now your weakest capability. Teach it or evolve it to keep raising the worker.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Today's Activity — real work events, oldest fear replaced by a
 * legible feed. Every entry is one completed execution and opens the
 * outputs it produced.
 * ------------------------------------------------------------------ */

import type { TimelineEntry } from "@/lib/workforce/selectors"
import { timeOfDay } from "@/lib/workforce/selectors"

export function ActivityTimeline({ entries, onOpen }: { entries: TimelineEntry[]; onOpen: (executionId: string) => void }) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Today&apos;s Activity</h2>
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No activity yet today.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {entries.map((e) => (
            <li key={e.id}>
              <button onClick={() => onOpen(e.executionId)} className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-secondary/40">
                <span className="w-14 shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">{timeOfDay(e.ts)}</span>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.tone === "bad" ? "bg-destructive" : e.tone === "warn" ? "bg-warn" : ""}`}
                  style={e.tone === "good" ? { backgroundColor: e.accent } : undefined}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{e.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * RESULT CARDS — section 4. What happened, translated into business
 * language: Worker, Task, Status, Output, the real Business Event
 * (plain language, never "BusinessEvent: lead_qualified"), the real
 * linked Metric, the real Source, and a real timestamp/execution id.
 * A card only ever shows a Business Event / Metric if one was actually
 * persisted for this exact output — a research output with no mapped
 * business event honestly shows none, never an invented one.
 * ------------------------------------------------------------------ */

import { ArrowRight } from "lucide-react"
import { OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { businessEventLabel, resultProvenanceState, sourceLabel, timeOfDay, type ResultCardData } from "@/lib/workforce/selectors"
import { getWorkerVisual } from "@/lib/workforce/visual-identity"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"

export function ResultCards({ results, onInspect }: { results: ResultCardData[]; onInspect: (executionId: string) => void }) {
  if (results.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-[13px] text-muted-foreground">No results yet — run a worker to produce one.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((r) => (
        <ResultCard key={r.output.id} data={r} onInspect={onInspect} />
      ))}
    </div>
  )
}

function ResultCard({ data, onInspect }: { data: ResultCardData; onInspect: (executionId: string) => void }) {
  const { output, worker, businessEvent, metrics, execution } = data
  const provenance = resultProvenanceState(execution)
  const businessMetric = metrics.find((m) => m.kind === "business")

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{OUTPUT_TYPE_META[output.type]?.label ?? output.type}</p>
        <ProvenanceBadge state={provenance} />
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: getWorkerVisual(worker).accent }} />
        <p className="truncate text-[12px] text-muted-foreground">{worker.identity.name}</p>
      </div>

      <p className="mt-2 text-pretty text-[13.5px] font-medium leading-snug text-foreground">{output.title}</p>

      {businessEvent ? (
        <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-2.5">
          <p className="font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">Business event</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-foreground">{businessEventLabel(businessEvent.type, businessEvent.numericValue)}</p>
          {businessMetric && (
            <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
              {businessMetric.key} = {businessMetric.value}
              {businessMetric.unit ?? ""}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[11.5px] text-muted-foreground/70">No business event mapped for this output type yet.</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-[9.5px] text-muted-foreground">{sourceLabel(businessEvent?.source, data.isDemo)}</p>
          <p className="font-mono text-[9.5px] text-muted-foreground/70">{timeOfDay(output.createdAt)} · {output.executionId}</p>
        </div>
        <button
          onClick={() => onInspect(output.executionId)}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/10"
        >
          Inspect <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </article>
  )
}

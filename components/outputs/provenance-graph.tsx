"use client"

/* ------------------------------------------------------------------ *
 * PROVENANCE GRAPH — section 6. "Where did this number come from?"
 * answered as a simple, real trace: Execution -> Output -> Business
 * Event -> Metric. Every node's id is the real database id it names;
 * a node the runtime never produced (a failed run has no Output, an
 * output type with no business-event mapping has no Business Event)
 * renders hollow with an honest "not recorded" label instead of a
 * fake checkmark. Clicking a node that does exist scrolls the
 * corresponding real section already on the page into view — this
 * never navigates anywhere or fetches anything new.
 * ------------------------------------------------------------------ */

import { Check, ChevronRight } from "lucide-react"

export interface ProvenanceNode {
  key: string
  label: string
  id?: string
  /** anchor element id to scroll to when this node is clicked, if it exists */
  anchorId?: string
}

export function ProvenanceGraph({ nodes }: { nodes: ProvenanceNode[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {nodes.map((n, i) => {
        const exists = !!n.id
        const clickable = exists && !!n.anchorId
        const content = (
          <>
            <span
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                exists ? "border-grow bg-grow/15 text-grow" : "border-border bg-secondary/40 text-muted-foreground/40"
              }`}
            >
              {exists ? <Check className="h-2.5 w-2.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0">
              <p className={`text-[11px] font-medium leading-tight ${exists ? "text-foreground" : "text-muted-foreground/60"}`}>{n.label}</p>
              <p className="truncate font-mono text-[9.5px] leading-tight text-muted-foreground">{n.id ?? "not recorded"}</p>
            </div>
          </>
        )
        return (
          <div key={n.key} className="flex items-center gap-1">
            {clickable ? (
              <button
                onClick={() => document.getElementById(n.anchorId!)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2 py-1.5">{content}</div>
            )}
            {i < nodes.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
          </div>
        )
      })}
    </div>
  )
}

/* STAGE GRID (RE/MAX Knowledge reference, docs/remax-knowledge-design-
 * reference.md §1.10) — the reusable "pipeline as a grid of stage
 * cards" primitive the reference reuses identically across Expansão/
 * Content Factory/Data Hub: each real stage gets its own status icon +
 * name + status text, never a plain progress strip. Used in Mission
 * Control for the currently-running Agent Run's own real steps
 * (WorkflowStep, GET /api/agent-runs/:id) — never a synthetic stage
 * list. */

import { Check, CircleDashed, Loader2, X } from "lucide-react"
import { translateStatus } from "@/lib/ontology/pt-br"

export interface Stage {
  label: string
  status: "queued" | "running" | "succeeded" | "failed" | "skipped" | "retrying"
  detail?: string | null
}

const ICON: Record<Stage["status"], typeof Check> = {
  succeeded: Check,
  running: Loader2,
  retrying: Loader2,
  queued: CircleDashed,
  skipped: CircleDashed,
  failed: X,
}

const TONE: Record<Stage["status"], string> = {
  succeeded: "border-grow/40 text-grow",
  running: "border-primary/50 text-primary",
  retrying: "border-primary/50 text-primary",
  queued: "border-border text-muted-foreground",
  skipped: "border-border text-muted-foreground",
  failed: "border-destructive/40 text-destructive",
}

export function StageGrid({ stages }: { stages: Stage[] }) {
  if (stages.length === 0) return null
  // Always 2 columns, never a viewport-based 3rd column: this grid
  // renders inside narrow panels whose own container width doesn't
  // track the viewport breakpoint (e.g. Mission Control's "Agentes em
  // ação" column at 1024px is far narrower than 1024px) — a
  // viewport-driven 3-column grid there truncates every label. 2
  // columns stays readable at every real container width this
  // primitive is used in.
  return (
    <div className="grid grid-cols-2 gap-2">
      {stages.map((s, i) => {
        const Icon = ICON[s.status]
        return (
          <div key={`${s.label}:${i}`} className={`flex items-start gap-2 rounded-md border bg-card/60 px-3 py-2 ${TONE[s.status]}`}>
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${s.status === "running" || s.status === "retrying" ? "animate-spin" : ""}`} />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-foreground">{s.label}</p>
              <p className="truncate text-[10.5px] text-muted-foreground">{s.detail ?? translateStatus(s.status)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

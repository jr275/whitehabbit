"use client"

/* ------------------------------------------------------------------ *
 * CREATIVE WALL — section 17. The output surface: exactly the 6
 * creative territories from the most recent skill_creative_territory_
 * generation output, each a real, distinct approach with real
 * structural scores. Clicking a card opens the deep Creative Detail
 * view (section 18).
 * ------------------------------------------------------------------ */

import { Plug } from "lucide-react"
import type { CreativeConcept } from "@/lib/marketing/model"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"

export function CreativeWall({ concepts, isDemo, onOpen }: { concepts: CreativeConcept[]; isDemo: boolean; onOpen: (concept: CreativeConcept) => void }) {
  if (concepts.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-[13px] text-muted-foreground">No creative territories yet — score an opportunity and generate territories for it.</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {concepts.map((c, i) => (
        <button key={c.id} onClick={() => onOpen(c)} className="flex flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <ProvenanceBadge provenance={isDemo ? "demo" : "real"} />
          </div>
          <p className="mt-1 text-pretty text-[14px] font-semibold leading-snug text-foreground">{c.title}</p>
          <span className="mt-1 w-fit rounded-full bg-secondary px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{c.emotionalIntent}</span>
          <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{c.thesis}</p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <ScoreCell label="Brand fit" value={c.brandFitScore} />
            <ScoreCell label="Novelty" value={c.noveltyScore} />
            <ScoreCell label="Predicted" value={c.predictedPerformanceScore} />
          </div>

          <div className="mt-3 flex items-center gap-1 border-t border-border pt-2.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
            <Plug className="h-2.5 w-2.5" /> Production not connected
          </div>
        </button>
      ))}
    </div>
  )
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-2 py-1.5">
      <p className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[8.5px] text-muted-foreground">{label}</p>
    </div>
  )
}

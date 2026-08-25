"use client"

/* ------------------------------------------------------------------ *
 * SIGNALS & OPPORTUNITIES — WORLD -> OPPORTUNITY (section 4/5). Real
 * IntelligenceSignal/CreativeOpportunity rows from the most recent
 * skill_cultural_intelligence output. A rejected opportunity is shown,
 * not hidden — "why NOT" is as real a result as "why now".
 * ------------------------------------------------------------------ */

import { ArrowRight, Ban } from "lucide-react"
import type { CreativeOpportunity, IntelligenceSignal } from "@/lib/marketing/model"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"

export function SignalsPanel({
  signals,
  opportunities,
  isDemo,
  onGenerateCreative,
  generating,
}: {
  signals: IntelligenceSignal[]
  opportunities: CreativeOpportunity[]
  isDemo: boolean
  onGenerateCreative: (topic: string) => void
  generating: boolean
}) {
  if (signals.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-[13px] text-muted-foreground">No signals detected yet — run Cultural Intelligence to scan real sources.</p>
  }

  const sorted = [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore)

  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map((o) => (
        <article key={o.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13.5px] font-medium text-foreground">{o.topic}</p>
                {o.status === "rejected" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive">
                    <Ban className="h-2.5 w-2.5" /> Rejected
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{o.rationale}</p>
            </div>
            <ProvenanceBadge state={isDemo ? "demo" : "real"} className="shrink-0" />
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <ScoreCell label="Opportunity" value={o.opportunityScore} />
            <ScoreCell label="Brand fit" value={o.brandRelevance} />
            <ScoreCell label="Audience fit" value={o.audienceRelevance} />
            <ScoreCell label="Novelty" value={o.novelty} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
            <p className="font-mono text-[10.5px] text-muted-foreground">{o.recommendedAction}</p>
            {o.status === "open" && (
              <button
                disabled={generating}
                onClick={() => onGenerateCreative(o.topic)}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/10 disabled:opacity-40"
              >
                Generate territories <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-2 py-1.5">
      <p className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  )
}

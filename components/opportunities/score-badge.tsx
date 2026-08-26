"use client"

/* Real Known/Estimated/Unavailable distinction (§11) — never renders a
 * null score as 0 or any other guessed value. */

import { classifyScoreComponent, type ScoreComponentBasis } from "@/lib/opportunity/scoring"
import type { OpportunityScoreComponents } from "@/lib/opportunity/model"

const BASIS_LABEL: Record<ScoreComponentBasis, string> = { known: "Known", estimated: "Estimated", unavailable: "Unavailable" }
const BASIS_CLASS: Record<ScoreComponentBasis, string> = {
  known: "text-grow",
  estimated: "text-warn",
  unavailable: "text-muted-foreground",
}

export function ScoreComponent({ label, componentKey, value }: { label: string; componentKey: keyof OpportunityScoreComponents; value: number | null }) {
  const basis = classifyScoreComponent(componentKey, value)
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card px-3 py-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold text-foreground">{value != null ? Math.round(value) : "—"}</span>
      <span className={`font-mono text-[9px] uppercase tracking-[0.12em] ${BASIS_CLASS[basis]}`}>{BASIS_LABEL[basis]}</span>
    </div>
  )
}

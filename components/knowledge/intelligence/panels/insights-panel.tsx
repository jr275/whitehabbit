"use client"

import { Activity, GitCompare, Layers, Zap } from "lucide-react"
import { useState } from "react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { DrawerObject, Insight, InsightType } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { ConfidenceMeter, FilterChip, PanelError, PanelHeading, PanelSkeleton } from "../shared"

const TYPE_META: Record<InsightType, { label: string; icon: typeof Zap }> = {
  pattern: { label: "Pattern", icon: GitCompare },
  trend: { label: "Trend", icon: Activity },
  outlier: { label: "Outlier", icon: Zap },
  synthesis: { label: "Synthesis", icon: Layers },
}

function insightToDrawer(i: Insight): DrawerObject {
  return {
    id: i.id,
    kind: `${TYPE_META[i.type].label} insight`,
    title: i.title,
    chips: [
      { label: `${Math.round(i.confidence * 100)}% confidence`, tone: "accent" },
      { label: `${i.evidenceItemIds.length} sources` },
    ],
    sections: [
      { heading: "The insight", body: i.body },
      {
        heading: "Evidence",
        body: `Drawn from ${i.evidenceItemIds.length} saved item${i.evidenceItemIds.length === 1 ? "" : "s"} across ${i.conceptIds.length} concept${i.conceptIds.length === 1 ? "" : "s"}.`,
      },
    ],
    ask: `Explain the connection behind: ${i.title}`,
  }
}

export function InsightsPanel({ onOpen }: { onOpen: (o: DrawerObject) => void }) {
  const { data, provenance, isLoading, error } = useEnvelope("insights", intelligence.getInsights)
  const [type, setType] = useState<InsightType | "all">("all")

  if (isLoading) return <PanelSkeleton rows={3} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  const types = [...new Set(data.map((i) => i.type))]
  const shown = type === "all" ? data : data.filter((i) => i.type === type)

  return (
    <div>
      <PanelHeading
        title="Insights"
        hint="Patterns, trends and syntheses Keeply surfaces from your reading."
        provenance={provenance}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip active={type === "all"} onClick={() => setType("all")}>
          All
        </FilterChip>
        {types.map((t) => (
          <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
            {TYPE_META[t].label}
          </FilterChip>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((i) => {
          const Icon = TYPE_META[i.type].icon
          return (
            <button
              key={i.id}
              onClick={() => onOpen(insightToDrawer(i))}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6 text-left transition-colors hover:border-[var(--kn-ai)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
            >
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--kn-ai)]">
                <Icon className="size-3.5" /> {TYPE_META[i.type].label}
              </div>
              <h3 className="text-balance font-serif text-xl font-medium leading-snug tracking-tight text-foreground">
                {i.title}
              </h3>
              <p className="line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{i.body}</p>
              <div className="mt-auto pt-1">
                <ConfidenceMeter value={i.confidence} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

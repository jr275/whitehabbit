"use client"

import { GitBranch, Lightbulb, Link2, Plus, TrendingUp } from "lucide-react"
import { useState } from "react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { ChangeType } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { dayLabel, FilterChip, PanelError, PanelHeading, PanelSkeleton } from "../shared"

const TYPE_META: Record<ChangeType, { label: string; icon: typeof Plus }> = {
  "concept-added": { label: "New concept", icon: Plus },
  "connection-formed": { label: "New connection", icon: Link2 },
  "theme-rising": { label: "Theme rising", icon: TrendingUp },
  "insight-generated": { label: "New insight", icon: Lightbulb },
  "gap-detected": { label: "Gap detected", icon: GitBranch },
}

export function WhatChangedPanel() {
  const { data, provenance, isLoading, error } = useEnvelope("changes", intelligence.getChanges)
  const [type, setType] = useState<ChangeType | "all">("all")

  if (isLoading) return <PanelSkeleton rows={5} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  const types = [...new Set(data.map((c) => c.type))]
  const shown = (type === "all" ? data : data.filter((c) => c.type === type)).sort((a, b) => a.daysAgo - b.daysAgo)

  return (
    <div>
      <PanelHeading
        title="What changed"
        hint="Everything Keeply has learned about your library recently."
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

      <ul className="divide-y divide-[var(--kn-edge)] overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)]">
        {shown.map((c) => {
          const Icon = TYPE_META[c.type].icon
          return (
            <li key={c.id} className="flex items-center gap-4 px-5 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--kn-well)] text-[var(--kn-ai)]">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] text-foreground">{c.summary}</p>
                <p className="mt-0.5 text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  {TYPE_META[c.type].label}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{dayLabel(c.daysAgo)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

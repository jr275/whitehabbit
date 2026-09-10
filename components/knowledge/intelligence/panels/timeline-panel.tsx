"use client"

import { Flag, GitBranch, Lightbulb, Save } from "lucide-react"
import { useState } from "react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { DrawerObject, TimelineEvent, TimelineKind } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { dayLabel, FilterChip, PanelError, PanelHeading, PanelSkeleton } from "../shared"

const KIND_META: Record<TimelineKind, { label: string; icon: typeof Save }> = {
  saved: { label: "Saved", icon: Save },
  "concept-emerged": { label: "Concept emerged", icon: Lightbulb },
  "theme-shift": { label: "Theme shift", icon: GitBranch },
  milestone: { label: "Milestone", icon: Flag },
}

function eventToDrawer(e: TimelineEvent): DrawerObject {
  return {
    id: e.id,
    kind: KIND_META[e.kind].label,
    title: e.title,
    subtitle: dayLabel(e.daysAgo),
    chips: [{ label: `${e.itemIds.length} related item${e.itemIds.length === 1 ? "" : "s"}` }],
    sections: [{ heading: "What happened", body: e.detail }],
  }
}

export function TimelinePanel({ onOpen }: { onOpen: (o: DrawerObject) => void }) {
  const { data, provenance, isLoading, error } = useEnvelope("timeline", intelligence.getTimeline)
  const [kind, setKind] = useState<TimelineKind | "all">("all")

  if (isLoading) return <PanelSkeleton rows={4} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  const kinds = [...new Set(data.map((e) => e.kind))]
  const shown = (kind === "all" ? data : data.filter((e) => e.kind === kind)).sort((a, b) => a.daysAgo - b.daysAgo)

  return (
    <div>
      <PanelHeading
        title="Timeline"
        hint="How your knowledge has moved over time."
        provenance={provenance}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip active={kind === "all"} onClick={() => setKind("all")}>
          All
        </FilterChip>
        {kinds.map((k) => (
          <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
            {KIND_META[k].label}
          </FilterChip>
        ))}
      </div>

      <ol className="relative ml-2 border-l border-[var(--kn-edge)]">
        {shown.map((e) => {
          const Icon = KIND_META[e.kind].icon
          return (
            <li key={e.id} className="relative mb-6 pl-8 last:mb-0">
              <span className="absolute -left-[13px] flex size-6 items-center justify-center rounded-full border border-[var(--kn-edge)] bg-[var(--kn-well)] text-[var(--kn-ai)]">
                <Icon className="size-3" />
              </span>
              <button
                onClick={() => onOpen(eventToDrawer(e))}
                className="w-full rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-[var(--kn-edge)] hover:bg-[var(--kn-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-lg font-medium tracking-tight text-foreground">{e.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{dayLabel(e.daysAgo)}</span>
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{e.detail}</p>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

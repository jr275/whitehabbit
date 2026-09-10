"use client"

import { useMemo, useState } from "react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { Concept, ConceptKind, DrawerObject } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { Chip, FilterChip, PanelError, PanelHeading, PanelSkeleton } from "../shared"

const KIND_LABELS: Record<ConceptKind, string> = {
  person: "People",
  technology: "Technology",
  theory: "Theory",
  event: "Events",
  organization: "Organizations",
  method: "Methods",
}

export function conceptToDrawer(c: Concept, labelOf: (id: string) => string): DrawerObject {
  return {
    id: c.id,
    kind: "Concept",
    title: c.label,
    subtitle: KIND_LABELS[c.kind],
    chips: [
      { label: `${c.mentions} mentions`, tone: "default" },
      { label: `${Math.round(c.strength * 100)}% central`, tone: "accent" },
    ],
    sections: [{ heading: "What this is", body: c.summary }],
    ask: `What have I saved about ${c.label}?`,
    relatedLabels: c.relatedConceptIds.map(labelOf).filter(Boolean),
  }
}

export function ConceptsPanel({ onOpen }: { onOpen: (o: DrawerObject) => void }) {
  const { data, provenance, isLoading, error } = useEnvelope("concepts", intelligence.getConcepts)
  const [kind, setKind] = useState<ConceptKind | "all">("all")

  const labelOf = useMemo(() => {
    const map = new Map((data ?? []).map((c) => [c.id, c.label]))
    return (id: string) => map.get(id) ?? ""
  }, [data])

  if (isLoading) return <PanelSkeleton rows={4} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  const kinds = [...new Set(data.map((c) => c.kind))]
  const shown = kind === "all" ? data : data.filter((c) => c.kind === kind)
  const sorted = [...shown].sort((a, b) => b.strength - a.strength)

  return (
    <div>
      <PanelHeading
        title="Concepts"
        hint="The distinct ideas Keeply detects across everything you've saved."
        provenance={provenance}
      />

      {/* filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip active={kind === "all"} onClick={() => setKind("all")}>
          All
        </FilterChip>
        {kinds.map((k) => (
          <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
            {KIND_LABELS[k]}
          </FilterChip>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(conceptToDrawer(c, labelOf))}
            className="group flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-5 text-left transition-colors hover:border-[var(--kn-ai)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-balance font-serif text-xl font-medium leading-tight tracking-tight text-foreground">
                {c.label}
              </span>
              <Chip tone="accent">{KIND_LABELS[c.kind]}</Chip>
            </div>
            <p className="line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{c.summary}</p>
            <div className="mt-auto flex items-center gap-3 pt-1">
              <span className="font-mono text-[11px] text-muted-foreground">{c.mentions} mentions</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-[var(--kn-ai)]/70" style={{ width: `${c.strength * 100}%` }} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

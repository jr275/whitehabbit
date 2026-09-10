"use client"

import { Compass } from "lucide-react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { DrawerObject, KnowledgeGap, Severity } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { Chip, PanelError, PanelHeading, PanelSkeleton } from "../shared"

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
const SEVERITY_TONE: Record<Severity, "warn" | "accent" | "default"> = {
  high: "warn",
  medium: "accent",
  low: "default",
}

function gapToDrawer(g: KnowledgeGap): DrawerObject {
  return {
    id: g.id,
    kind: "Knowledge gap",
    title: g.label,
    chips: [{ label: `${g.severity} priority`, tone: SEVERITY_TONE[g.severity] }],
    sections: [
      { heading: "The gap", body: g.description },
      { heading: "Suggested next step", body: g.suggestion },
    ],
    ask: `What have I saved that touches on ${g.label}?`,
  }
}

export function GapsPanel({ onOpen }: { onOpen: (o: DrawerObject) => void }) {
  const { data, provenance, isLoading, error } = useEnvelope("gaps", intelligence.getGaps)

  if (isLoading) return <PanelSkeleton rows={3} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  const sorted = [...data].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return (
    <div>
      <PanelHeading
        title="Knowledge gaps"
        hint="Where your library is thin or one-sided — and how to round it out."
        provenance={provenance}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {sorted.map((g) => (
          <button
            key={g.id}
            onClick={() => onOpen(gapToDrawer(g))}
            className="flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6 text-left transition-colors hover:border-[var(--kn-ai)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
          >
            <div className="flex items-start justify-between gap-2">
              <Compass className="size-5 text-[var(--kn-ai)]" />
              <Chip tone={SEVERITY_TONE[g.severity]}>{g.severity}</Chip>
            </div>
            <h3 className="font-serif text-lg font-medium leading-snug tracking-tight text-foreground">{g.label}</h3>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">{g.description}</p>
            <p className="mt-auto border-t border-[var(--kn-edge)] pt-3 text-[13px] leading-relaxed text-foreground/80">
              {g.suggestion}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

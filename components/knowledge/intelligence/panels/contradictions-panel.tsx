"use client"

import { Scale } from "lucide-react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { Contradiction, DrawerObject } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { Chip, PanelError, PanelHeading, PanelSkeleton } from "../shared"

function toDrawer(x: Contradiction): DrawerObject {
  return {
    id: x.id,
    kind: "Contradiction",
    title: x.topic,
    chips: [{ label: x.status, tone: x.status === "unresolved" ? "warn" : "default" }],
    sections: [
      { heading: `Source A — ${x.a.sourceLabel}`, body: x.a.claim },
      { heading: `Source B — ${x.b.sourceLabel}`, body: x.b.claim },
    ],
    ask: `Two things I saved disagree about "${x.topic}". Help me reconcile them.`,
  }
}

export function ContradictionsPanel({ onOpen }: { onOpen: (o: DrawerObject) => void }) {
  const { data, provenance, isLoading, error } = useEnvelope("contradictions", intelligence.getContradictions)

  if (isLoading) return <PanelSkeleton rows={2} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  return (
    <div>
      <PanelHeading
        title="Contradictions"
        hint="Where two things you saved disagree. Worth reconciling."
        provenance={provenance}
      />

      <div className="space-y-3">
        {data.map((x) => (
          <div key={x.id} className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Scale className="size-5 text-[var(--kn-ai)]" />
                <h3 className="font-serif text-xl font-medium tracking-tight text-foreground">{x.topic}</h3>
              </div>
              <Chip tone={x.status === "unresolved" ? "warn" : "default"}>{x.status}</Chip>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[x.a, x.b].map((side, i) => (
                <div key={i} className="rounded-xl border border-[var(--kn-edge)] bg-[var(--kn-well)]/40 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {i === 0 ? "Source A" : "Source B"}
                  </p>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-foreground">{side.claim}</p>
                  <p className="mt-3 text-[12px] italic text-muted-foreground">{side.sourceLabel}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => onOpen(toDrawer(x))}
              className="mt-4 text-[13px] font-medium text-[var(--kn-ai)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:underline"
            >
              Reconcile with Ask →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

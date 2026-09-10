"use client"

import { ChevronDown, FileText, Layers, TrendingDown, TrendingUp } from "lucide-react"
import { useState } from "react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { DrawerObject, Momentum, Theme } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { cn } from "@/lib/utils"
import { Chip, PanelError, PanelHeading, PanelSkeleton } from "../shared"

const MOMENTUM: Record<Momentum, { label: string; tone: "accent" | "warn" | "default"; icon: typeof TrendingUp }> = {
  rising: { label: "Rising", tone: "accent", icon: TrendingUp },
  steady: { label: "Steady", tone: "default", icon: Layers },
  cooling: { label: "Cooling", tone: "warn", icon: TrendingDown },
}

function themeToDrawer(t: Theme): DrawerObject {
  return {
    id: t.id,
    kind: "Theme",
    title: t.label,
    subtitle: `${t.itemCount} items · ${Math.round(t.coverage * 100)}% of your library`,
    chips: [
      { label: MOMENTUM[t.momentum].label, tone: MOMENTUM[t.momentum].tone },
      { label: `${t.conceptIds.length} concepts`, tone: "default" },
    ],
    sections: [{ heading: "About this theme", body: t.description }],
    ask: `Summarize what I've saved under ${t.label}.`,
    relatedLabels: t.children.map((c) => c.label),
  }
}

export function ThemesPanel({ onOpen }: { onOpen: (o: DrawerObject) => void }) {
  const { data, provenance, isLoading, error } = useEnvelope("themes", intelligence.getThemes)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading) return <PanelSkeleton rows={4} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  return (
    <div>
      <PanelHeading
        title="Themes"
        hint="Clusters of related concepts and items. Expand one to see what's inside."
        provenance={provenance}
      />

      <div className="space-y-3">
        {data.map((t) => {
          const m = MOMENTUM[t.momentum]
          const MIcon = m.icon
          const open = expanded === t.id
          return (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)]">
              <button
                onClick={() => setExpanded(open ? null : t.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-[var(--kn-well)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--kn-ai)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-serif text-xl font-medium tracking-tight text-foreground">{t.label}</span>
                    <Chip tone={m.tone}>
                      <MIcon className="size-3" /> {m.label}
                    </Chip>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[13.5px] text-muted-foreground">{t.description}</p>
                </div>
                <div className="hidden w-40 shrink-0 sm:block">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{t.itemCount} items</span>
                    <span>{Math.round(t.coverage * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-[var(--kn-ai)]/70" style={{ width: `${t.coverage * 100}%` }} />
                  </div>
                </div>
                <ChevronDown
                  className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                />
              </button>

              {open && (
                <div className="border-t border-[var(--kn-edge)] px-6 py-5">
                  <div className="space-y-2">
                    {t.children.map((c) => (
                      <div key={c.id} className="flex items-center gap-3">
                        {c.type === "item" ? (
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <Layers className="size-4 shrink-0 text-[var(--kn-ai)]" />
                        )}
                        <span className="flex-1 text-[14.5px] text-foreground">{c.label}</span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-[var(--kn-ai)]/60" style={{ width: `${c.weight * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => onOpen(themeToDrawer(t))}
                    className="mt-4 text-[13px] font-medium text-[var(--kn-ai)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:underline"
                  >
                    Open theme details →
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

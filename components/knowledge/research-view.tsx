"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { FileText, Plus, Sparkles } from "lucide-react"
import { getKnowledgeItems } from "@/lib/knowledge/demo-data"
import { cn } from "@/lib/utils"

const PROJECTS = [
  { id: "r-agents", name: "Agent architectures", topic: "AI", itemIds: ["k-agents", "k-agents-podcast", "k-chip"] },
  { id: "r-pmf", name: "Measuring product-market fit", topic: "Product", itemIds: ["k-pmf", "k-second-brain", "k-note"] },
]

export function ResearchView() {
  const [activeId, setActiveId] = useState(PROJECTS[0].id)
  const items = getKnowledgeItems()
  const active = PROJECTS.find((p) => p.id === activeId) ?? PROJECTS[0]
  const sources = useMemo(
    () => items.filter((i) => active.itemIds.includes(i.id)),
    [active, items],
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Project rail */}
      <aside className="space-y-4">
        <div className="space-y-1">
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                p.id === activeId
                  ? "bg-white/[0.06] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
              )}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--kn-edge)] px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> New research project
        </button>
      </aside>

      {/* Workspace */}
      <section className="kn-rise space-y-6">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {active.topic} · {sources.length} sources
          </p>
          <h2 className="mt-1 font-serif text-2xl leading-tight">{active.name}</h2>
        </header>

        {/* Synthesis */}
        <div className="rounded-2xl border border-[var(--kn-ai)]/25 bg-gradient-to-br from-[var(--kn-ai)]/[0.06] to-transparent p-5 sm:p-6">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--kn-ai)]">
            <Sparkles className="h-3.5 w-3.5" /> Synthesis
          </span>
          <p className="mt-3 text-pretty leading-relaxed text-foreground/85">
            Your sources converge on a single claim: durable outcomes come from measurement
            systems, not one-off breakthroughs. Each piece adds a facet — instrumentation,
            feedback loops, and the discipline to act on what the data says.
          </p>
        </div>

        {/* Sources */}
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Sources
          </p>
          <div className="space-y-2">
            {sources.map((item) => (
              <Link
                key={item.id}
                href={`/knowledge/read/${item.id}`}
                className="group flex items-start gap-4 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-3 transition-colors hover:border-foreground/20"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                  {item.cover ? (
                    <Image src={item.cover || "/placeholder.svg"} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-secondary">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-base leading-snug text-foreground">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.source}</p>
                  {item.aiSummary ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {item.aiSummary}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

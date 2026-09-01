"use client"

import { useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { Quote, ArrowUpRight } from "lucide-react"
import { AskLibrary } from "./ask-library"
import { DailyIntelligence } from "./intelligence"
import { getInsights, getKnowledgeItems } from "@/lib/knowledge/demo-data"

/** A representative answer that grounds itself in real saved items (citations). */
function GroundedAnswer() {
  const cited = useMemo(
    () => getKnowledgeItems().filter((i) => ["k-agents", "k-agents-podcast", "k-chip"].includes(i.id)),
    [],
  )

  return (
    <article className="kn-rise rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6 sm:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        From 7 pieces in your library
      </p>
      <div className="mt-4 border-l-2 border-[var(--kn-ai)]/40 pl-4">
        <Quote className="mb-2 h-4 w-4 text-[var(--kn-ai)]" />
        <p className="text-pretty font-serif text-lg leading-relaxed text-foreground/90">
          Across your saves, one theme is consistent: reliable agents are an{" "}
          <span className="text-foreground">evaluation problem</span>, not a model problem. The
          winning teams wire planning, tool-use and measurement together — and treat the supply
          chain of compute as a strategic constraint.
        </p>
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Grounded in
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {cited.map((item) => (
          <Link
            key={item.id}
            href={`/knowledge/read/${item.id}`}
            className="group flex items-center gap-3 rounded-xl border border-[var(--kn-edge)] bg-background/40 p-2.5 transition-colors hover:border-foreground/20"
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
              {item.cover ? (
                <Image src={item.cover || "/placeholder.svg"} alt="" fill sizes="40px" className="object-cover" />
              ) : null}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{item.title}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </article>
  )
}

export function AiView() {
  const insights = getInsights()
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <AskLibrary />
      <GroundedAnswer />
      <DailyIntelligence insights={insights} />
    </div>
  )
}

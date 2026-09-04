"use client"

import { useEffect } from "react"
import Link from "next/link"
import { BookOpen, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { KnowledgeCitation, KnowledgeConfidence } from "@/lib/knowledge/ai"

interface AiSourcesProps {
  citations: KnowledgeCitation[]
  activeCitation: string | null
  /** Heading — "Sources" normally, "Evidence" when shown without an answer. */
  title?: string
  /** Optional, API-provided. Rendered as a quiet evidence-quality signal
      tied to the sources — never as an authoritative AI score, and never
      fabricated when the API omits it. */
  confidence?: KnowledgeConfidence
}

/**
 * The evidence behind the answer. Each card maps a citation marker to a
 * real saved item, so the relationship Answer → Citation → Evidence →
 * Original source is explicit and navigable. Nothing is invented: optional
 * fields (excerpt, relevance, chunk) render only when the API provides them.
 */
export function AiSources({ citations, activeCitation, title = "Sources", confidence }: AiSourcesProps) {
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

  // When a citation marker is clicked in the answer, bring its card into view.
  useEffect(() => {
    if (!activeCitation) return
    const el = document.getElementById(`kn-source-${activeCitation}`)
    el?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" })
  }, [activeCitation, reduceMotion])

  if (citations.length === 0) return null

  return (
    <section aria-label={title} className="mt-10 border-t border-[var(--kn-edge)] pt-6">
      <h2 className="mb-4 flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
        <span className="tabular-nums text-muted-foreground/60">{citations.length}</span>
        {confidence ? <ConfidenceSignal confidence={confidence} /> : null}
      </h2>
      <ol className="flex flex-col gap-3">
        {citations.map((c) => (
          <AiSourceCard key={c.citationId} citation={c} active={c.citationId === activeCitation} />
        ))}
      </ol>
    </section>
  )
}

/** A calm evidence-quality signal: how well the user's own sources
 *  support the answer. Normal-case and muted so it reads as a property
 *  of the evidence, not an authoritative confidence score. */
function ConfidenceSignal({ confidence }: { confidence: KnowledgeConfidence }) {
  const label =
    confidence === "high" ? "Well supported" : confidence === "medium" ? "Partly supported" : "Limited support"
  return (
    <span className="ml-auto flex items-center gap-1.5 text-[11px] font-normal normal-case tracking-normal text-muted-foreground/70">
      <span
        className={cn(
          "size-1.5 rounded-full",
          confidence === "high"
            ? "bg-[var(--kn-ai)]"
            : confidence === "medium"
              ? "bg-[var(--kn-ai)]/50"
              : "bg-muted-foreground/40",
        )}
      />
      {label} by your sources
    </span>
  )
}

function AiSourceCard({ citation, active }: { citation: KnowledgeCitation; active: boolean }) {
  const { citationId, knowledgeItemId, chunkId, title, sourceUrl, excerpt, relevanceScore } = citation
  const domain = domainOf(sourceUrl)
  const readerHref = knowledgeItemId ? `/knowledge/read/${knowledgeItemId}` : null
  // A provided 0–1 score is shown as a percentage; a provided >1 score as-is.
  const relevance =
    typeof relevanceScore === "number"
      ? `${Math.round(relevanceScore <= 1 ? relevanceScore * 100 : relevanceScore)}% relevant`
      : null

  return (
    <li
      id={`kn-source-${citationId}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card p-4 transition-colors",
        active ? "border-[var(--kn-ai)]/60 ring-1 ring-[var(--kn-ai)]/40" : "border-[var(--kn-edge)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--kn-ai)]/15 text-[12px] font-medium tabular-nums text-[var(--kn-ai)]">
          {citationId}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            {domain ? <span className="truncate">{domain}</span> : null}
            {relevance ? (
              <>
                {domain ? <span aria-hidden className="text-muted-foreground/40">·</span> : null}
                <span className="shrink-0 text-muted-foreground/80">{relevance}</span>
              </>
            ) : null}
          </div>

          <h3 className="mt-1 text-pretty text-[0.95rem] font-medium leading-snug text-foreground">{title}</h3>

          {excerpt ? (
            <p className="mt-2 line-clamp-3 text-pretty text-[0.85rem] leading-relaxed text-muted-foreground">
              “{excerpt}”
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px]">
            {readerHref ? (
              <Link
                href={readerHref}
                className="flex items-center gap-1.5 font-medium text-[var(--kn-ai)] transition-opacity hover:opacity-80"
              >
                <BookOpen className="size-3.5" /> Open in reader
              </Link>
            ) : null}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3.5" /> Original
              </a>
            ) : null}
            {chunkId ? (
              <span className="font-mono text-[11px] text-muted-foreground/50">chunk {chunkId}</span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  )
}

function domainOf(url?: string): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

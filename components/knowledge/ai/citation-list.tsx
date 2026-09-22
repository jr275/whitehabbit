"use client"

/* ================================================================== *
 * SOURCES — the second half of the claim → chunk → item → source
 * chain. Every card here is built from a citation the API returned;
 * nothing on it is derived, inferred or filled in.
 *
 * A source the answer did not reference is shown as consulted, not as
 * evidence. That distinction is the whole reason `used` travels on the
 * wire: a list that presents both identically tells the reader four
 * sources back a claim when one did.
 * ================================================================== */

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import type { AnsweredCitation } from "@/lib/knowledge/ai"

export function CitationList({ citations }: { citations: AnsweredCitation[] }) {
  if (citations.length === 0) return null

  const cited = citations.filter((c) => c.used)
  const consulted = citations.filter((c) => !c.used)

  return (
    <section className="mt-8 space-y-6">
      {cited.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-[13px] font-medium text-foreground">
            {cited.length === 1 ? "1 source" : `${cited.length} sources`}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {cited.map((c) => (
              <CitationCard key={c.citationId} citation={c} />
            ))}
          </ul>
        </div>
      ) : null}

      {consulted.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-[13px] font-medium text-muted-foreground">
            Consulted, not cited
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {consulted.map((c) => (
              <CitationCard key={c.citationId} citation={c} muted />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function CitationCard({ citation, muted = false }: { citation: AnsweredCitation; muted?: boolean }) {
  return (
    <li
      id={`source-${citation.citationId}`}
      className={`scroll-mt-24 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-4 transition-colors ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-medium tabular-nums ${
            muted ? "bg-secondary text-muted-foreground" : "bg-[var(--kn-ai)]/12 text-[var(--kn-ai)]"
          }`}
        >
          {citation.citationId}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Links to the saved item's own reader, not to the original
              URL: the point of a citation here is the passage the user
              already has, and the outbound link is offered beside it. */}
          <Link
            href={`/knowledge/read/${citation.knowledgeItemId}`}
            className="line-clamp-2 text-sm font-medium leading-snug text-foreground hover:underline"
          >
            {citation.title}
          </Link>
          {citation.excerpt ? (
            <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{citation.excerpt}</p>
          ) : null}
          {citation.sourceUrl ? (
            <a
              href={citation.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              {hostOf(citation.sourceUrl)}
            </a>
          ) : null}
        </div>
      </div>
    </li>
  )
}

/** Display-only. A URL that will not parse is shown verbatim rather
 *  than dropped — the citation is still real. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

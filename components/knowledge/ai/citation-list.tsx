"use client"

/* ================================================================== *
 * EVIDENCE and SOURCES — the second half of the
 * claim → chunk → item → source chain.
 *
 * These used to be one grid of bordered cards titled "3 sources", each
 * card holding a number, a title, an excerpt and a domain. That
 * conflated two different things a reader needs at two different
 * moments: the PASSAGE that backs a sentence they just read, and the
 * PIECE it came from, which they may want to open. A research result
 * separates them, so they are separated here:
 *
 *   EVIDENCE — the retrieved passages, in citation order, each one
 *              still attached to its [n] so a claim can be walked back
 *              to the exact text. Amber rule: this is quoted material.
 *   SOURCES  — the items, as a plain list. Cited first; consulted but
 *              uncited below, because a list that shows both the same
 *              way tells the reader four sources back a claim when one
 *              did.
 *
 * Nothing here is derived, inferred or filled in — every field comes
 * from a citation the API returned, and a citation with no excerpt
 * simply contributes no evidence row.
 * ================================================================== */

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { AnsweredCitation } from "@/lib/knowledge/ai"

/** The passages. Skipped entirely when no citation carried one, rather
 *  than rendered as an empty section with a heading. */
export function EvidenceList({ citations }: { citations: AnsweredCitation[] }) {
  const withText = citations.filter((c) => c.used && c.excerpt)
  if (withText.length === 0) return null

  return (
    <section className="pk-section">
      <h2 className="pk-label mb-5 text-[var(--pk-evidence)]">Evidence</h2>
      <ol className="flex flex-col gap-6">
        {withText.map((c) => (
          <li key={c.citationId} id={`source-${c.citationId}`} className="flex scroll-mt-24 gap-3.5">
            <Marker id={c.citationId} />
            <div className="min-w-0 flex-1">
              <blockquote className="pk-evidence text-[14.5px] leading-[1.68] text-[var(--pk-ink-2)]">
                {c.excerpt}
              </blockquote>
              <Link
                href={`/knowledge/read/${c.knowledgeItemId}`}
                className="pk-meta mt-2 inline-block transition-colors hover:text-[var(--pk-ink)]"
              >
                {c.title}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The pieces. Rows, not cards — they are entries in one list. */
export function CitationList({ citations }: { citations: AnsweredCitation[] }) {
  if (citations.length === 0) return null

  const cited = citations.filter((c) => c.used)
  const consulted = citations.filter((c) => !c.used)

  return (
    <section className="pk-section">
      <h2 className="pk-label mb-5">Sources</h2>

      {cited.length > 0 && (
        <ul className="pk-rows">
          {cited.map((c) => (
            <SourceRow key={c.citationId} citation={c} />
          ))}
        </ul>
      )}

      {consulted.length > 0 && (
        <div className="mt-8">
          <p className="pk-label mb-4">Consulted, not cited</p>
          <ul className="pk-rows">
            {consulted.map((c) => (
              <SourceRow key={c.citationId} citation={c} muted />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function SourceRow({ citation, muted = false }: { citation: AnsweredCitation; muted?: boolean }) {
  return (
    <li className={`pk-row flex items-baseline gap-3.5 ${muted ? "opacity-65" : ""}`}>
      <Marker id={citation.citationId} muted={muted} />
      <div className="min-w-0 flex-1">
        {/* Links to the saved item's own reader, not to the original
            URL: the point of a citation here is the passage the user
            already has, and the outbound link is offered beside it. */}
        <Link
          href={`/knowledge/read/${citation.knowledgeItemId}`}
          /* block, not inline: the domain link below is a separate line
             of the row, and two inline anchors ran together as one
             word ("Why chunking projects failexample.com"). */
          className="block text-[15px] font-medium leading-snug text-[var(--pk-ink)] hover:underline"
        >
          {citation.title}
        </Link>
        {citation.sourceUrl && (
          <a
            href={citation.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="pk-meta mt-1 inline-flex items-center gap-1 transition-colors hover:text-[var(--pk-ink)]"
          >
            {hostOf(citation.sourceUrl)}
            <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
    </li>
  )
}

/** The [n] marker. Mono, amber, unfilled: a reference is a pointer, and
 *  a filled chip at every citation would read as a button. */
function Marker({ id, muted = false }: { id: number | string; muted?: boolean }) {
  return (
    <span aria-hidden className={`pk-label mt-[3px] w-5 shrink-0 tabular-nums ${muted ? "" : "text-[var(--pk-evidence)]"}`}>
      [{id}]
    </span>
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

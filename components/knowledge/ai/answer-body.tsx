"use client"

/* ================================================================== *
 * ANSWER BODY — renders the tokens produced by lib/knowledge/ai.ts.
 *
 * The decision of which [n] becomes a link lives there, not here, so
 * it can be tested: see tokenizeAnswer's comment for why that
 * particular rule is the one worth protecting.
 *
 * Text is inserted as text nodes, never as HTML, and no markdown is
 * parsed. This is model output derived from arbitrary saved web
 * pages; the one thing it must not be able to do is draw its own UI.
 * ================================================================== */

import { Fragment } from "react"
import { paragraphsOf, type AnsweredCitation } from "@/lib/knowledge/ai"

export function AnswerBody({ text, citations }: { text: string; citations: AnsweredCitation[] }) {
  const paragraphs = paragraphsOf(text, citations.map((c) => c.citationId))

  return (
    <div className="space-y-4 text-[15px] leading-[1.7] text-foreground">
      {paragraphs.map((tokens, i) => (
        <p key={i} className="text-pretty">
          {tokens.map((token, j) => (
            <Fragment key={j}>
              {token.type === "text" ? (
                token.value
              ) : token.type === "citation" ? (
                <a
                  href={`#source-${token.citationId}`}
                  className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-[var(--kn-ai)]/12 px-1 align-[1px] text-[11px] font-medium tabular-nums text-[var(--kn-ai)] no-underline hover:bg-[var(--kn-ai)]/20"
                >
                  {token.citationId}
                </a>
              ) : (
                <span
                  title="This reference doesn't match any source that was retrieved."
                  className="mx-0.5 inline-flex h-[18px] items-center justify-center rounded-md border border-dashed border-border px-1 align-[1px] text-[11px] tabular-nums text-muted-foreground line-through"
                >
                  {token.citationId}
                </span>
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}

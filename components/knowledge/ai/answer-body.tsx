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
    <div className="max-w-[var(--pk-measure)] space-y-5 text-[16.5px] leading-[1.72] text-[var(--pk-ink)]">
      {paragraphs.map((tokens, i) => (
        <p key={i} className="text-pretty">
          {tokens.map((token, j) => (
            <Fragment key={j}>
              {token.type === "text" ? (
                token.value
              ) : token.type === "citation" ? (
                <a
                  href={`#source-${token.citationId}`}
                  /* A citation is a REFERENCE, not something the model
                     generated — it wears the evidence signal, and it is a
                     superscript marker rather than a filled chip, which
                     at every third sentence reads as a row of buttons. */
                  className="mx-px align-super text-[11px] font-medium tabular-nums text-[var(--pk-evidence)] no-underline hover:underline"
                >
                  [{token.citationId}]
                </a>
              ) : (
                <span
                  title="This reference doesn't match any source that was retrieved."
                  className="mx-px align-super text-[11px] tabular-nums text-[var(--pk-ink-4)] line-through"
                >
                  [{token.citationId}]
                </span>
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}

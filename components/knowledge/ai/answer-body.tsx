"use client"

/* ================================================================== *
 * ANSWER BODY — renders the blocks produced by lib/knowledge/ai.ts.
 *
 * TWO RULES, UNCHANGED SINCE THIS FILE WAS A LIST OF PARAGRAPHS.
 *
 * 1. The decision of which [n] becomes a link lives in the library,
 *    not here, so it can be tested: see tokenizeAnswer's comment for
 *    why that particular rule is the one worth protecting.
 *
 * 2. Text is inserted as text nodes, never as HTML, and no markdown
 *    parser runs. This is model output derived from arbitrary saved
 *    web pages; the one thing it must not be able to do is draw its
 *    own UI.
 *
 * WHAT CHANGED. The model was always free to use a bulleted list or a
 * backticked identifier — SYSTEM_PROMPT asks for prose and says
 * nothing about formatting — and all of it used to land on screen as
 * its own syntax. blocksOf now reports that structure as DATA over a
 * closed set of kinds, and this file maps each kind to one element it
 * chose in advance. The grammar cannot introduce an element; the
 * switch below is the complete list of what an answer can ever
 * render as. Rule 2 is therefore stronger than it was, not weaker:
 * before, a construct the text invented passed through as characters,
 * and now it still does.
 * ================================================================== */

import { Fragment, useCallback, useState } from "react"
import { Check, Copy } from "lucide-react"
import { blocksOf, type AnswerBlock, type AnswerInline, type AnsweredCitation } from "@/lib/knowledge/ai"
import { useT } from "../i18n"

export function AnswerBody({ text, citations }: { text: string; citations: AnsweredCitation[] }) {
  const blocks = blocksOf(
    text,
    citations.map((c) => c.citationId),
  )

  return (
    <div className="max-w-[var(--pk-measure)] space-y-5 text-[16.5px] leading-[1.72] text-[var(--pk-ink)]">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}

/** The closed set. A block kind with no case here would not compile —
 *  `never` at the end is what makes that true rather than hoped for. */
function Block({ block }: { block: AnswerBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-pretty">
          <Inline tokens={block.inline} />
        </p>
      )

    /* The page owns h1 (its title) and h2 ("Answer"), so an answer's
     * own headings start at h3 — a real document outline rather than a
     * second competing one. */
    case "heading":
      return block.level === 3 ? (
        <h3 className="pt-2 text-[17px] font-semibold leading-[1.35] tracking-[-0.012em] text-[var(--pk-ink)]">
          <Inline tokens={block.inline} />
        </h3>
      ) : (
        <h4 className="pt-1 text-[15.5px] font-semibold leading-[1.4] text-[var(--pk-ink-2)]">
          <Inline tokens={block.inline} />
        </h4>
      )

    case "list": {
      const Tag = block.ordered ? "ol" : "ul"
      return (
        <Tag
          className={
            block.ordered
              ? "ml-[1.15em] list-decimal space-y-2 tabular-nums marker:text-[var(--pk-ink-4)]"
              : "ml-[1.1em] list-disc space-y-2 marker:text-[var(--pk-ink-4)]"
          }
        >
          {block.items.map((item, i) => (
            <li key={i} className="pl-1 text-pretty">
              <Inline tokens={item} />
            </li>
          ))}
        </Tag>
      )
    }

    /* A NEUTRAL rule, deliberately not the evidence hue. The evidence
     * colour means "a passage retrieved from your library"; a quote the
     * model wrote is not that, and wearing the same mark would claim
     * provenance it does not have. */
    case "quote":
      return (
        <blockquote className="border-l-2 border-[var(--pk-rule-2)] pl-3.5 text-[var(--pk-ink-2)]">
          <Inline tokens={block.inline} />
        </blockquote>
      )

    case "code":
      return <CodeBlock language={block.language} code={block.code} />

    default: {
      const exhaustive: never = block
      return exhaustive
    }
  }
}

function Inline({ tokens }: { tokens: AnswerInline[] }) {
  const t = useT()
  return (
    <>
      {tokens.map((token, i) => (
        <Fragment key={i}>
          {token.type === "text" ? (
            token.value
          ) : token.type === "strong" ? (
            <strong className="font-semibold">{token.value}</strong>
          ) : token.type === "emphasis" ? (
            <em className="italic">{token.value}</em>
          ) : token.type === "code" ? (
            <code className="rounded-[var(--pk-r-sm)] bg-[var(--pk-sunken)] px-[0.3em] py-[0.1em] font-[family-name:var(--font-geist-mono)] text-[0.875em] text-[var(--pk-ink-2)]">
              {token.value}
            </code>
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
              title={t.ask.unknownCitation}
              className="mx-px align-super text-[11px] tabular-nums text-[var(--pk-ink-4)] line-through"
            >
              [{token.citationId}]
            </span>
          )}
        </Fragment>
      ))}
    </>
  )
}

/**
 * A code sample.
 *
 * It scrolls inside its own box — the page never does, which is the
 * difference between a long line being readable on a phone and the
 * whole layout shifting sideways. The language is shown only when the
 * fence named one: it is a LABEL copied from the text, never a reason
 * to run or highlight anything.
 */
function CodeBlock({ language, code }: { language: string | null; code: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    // Clipboard access is denied outright in some contexts; a failed
    // copy leaves the button alone rather than claiming success.
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1_600)
      })
      .catch(() => {})
  }, [code])

  return (
    <div className="group relative rounded-[var(--pk-r)] border border-[var(--pk-rule)] bg-[var(--pk-sunken)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--pk-rule)] px-3.5 py-2">
        <span className="pk-label">{language ?? t.ask.code}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t.ask.copied : t.ask.copyCode}
          className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--pk-ink-3)] transition-colors hover:text-[var(--pk-ink)]"
        >
          {copied ? <Check className="size-3.5 text-[var(--pk-good)]" /> : <Copy className="size-3.5" />}
          <span>{copied ? t.ask.copied : t.ask.copy}</span>
        </button>
      </div>
      <pre className="thin-scroll overflow-x-auto px-3.5 py-3">
        <code className="font-[family-name:var(--font-geist-mono)] text-[12.5px] leading-[1.6] text-[var(--pk-ink-2)]">
          {code}
        </code>
      </pre>
    </div>
  )
}

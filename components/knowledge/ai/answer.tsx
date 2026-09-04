"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { KnowledgeAIResponse, KnowledgeCitation } from "@/lib/knowledge/ai"

interface AiAnswerProps {
  response: KnowledgeAIResponse
  activeCitation: string | null
  onCite: (citationId: string) => void
  onFollowUp?: (question: string) => void
}

/**
 * Renders whatever grounded answer the real API returns — headings,
 * paragraphs, bullet and numbered lists, emphasis, links, and inline
 * [n] citation markers. Nothing here fabricates content; it only
 * presents `response.answer` and links markers back to the evidence.
 */
export function AiAnswer({ response, activeCitation, onCite, onFollowUp }: AiAnswerProps) {
  const { answer, citations, followUps } = response

  return (
    <section aria-label="Answer" className="animate-in fade-in duration-500">
      <div className="space-y-5 text-[1.075rem] leading-[1.8] text-foreground/90">
        {renderBlocks(answer, citations, activeCitation, onCite)}
      </div>

      {followUps && followUps.length > 0 ? (
        <div className="mt-8 border-t border-[var(--kn-edge)] pt-6">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Follow up
          </h3>
          <div className="flex flex-col gap-2">
            {followUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onFollowUp?.(q)}
                className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--kn-edge)] bg-card px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:border-[var(--kn-ai)]/50 hover:text-foreground"
              >
                <span className="text-pretty">{q}</span>
                <span className="text-muted-foreground transition-colors group-hover:text-[var(--kn-ai)]">{"→"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ── Lightweight, dependency-free block renderer ────────────────────
 * Splits the answer on blank lines, then renders each block as a
 * heading, unordered list, ordered list, or paragraph. Inline spans
 * (bold, links, [n] citations) are tokenized within each line. */
function renderBlocks(
  text: string,
  citations: KnowledgeCitation[],
  activeCitation: string | null,
  onCite: (id: string) => void,
): ReactNode[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/)
  const out: ReactNode[] = []

  blocks.forEach((raw, i) => {
    const block = raw.trim()
    if (!block) return
    const lines = block.split("\n")

    // Heading (#, ##, ###)
    const heading = block.match(/^(#{1,3})\s+(.*)$/)
    if (heading && lines.length === 1) {
      const level = heading[1].length
      const content = renderInline(heading[2], citations, activeCitation, onCite)
      out.push(
        level <= 1 ? (
          <h3 key={i} className="pt-2 text-lg font-semibold tracking-tight text-foreground">
            {content}
          </h3>
        ) : (
          <h4 key={i} className="pt-1 text-base font-semibold tracking-tight text-foreground">
            {content}
          </h4>
        ),
      )
      return
    }

    // Unordered list
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(
        <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
          {lines.map((l, j) => (
            <li key={j}>{renderInline(l.replace(/^\s*[-*]\s+/, ""), citations, activeCitation, onCite)}</li>
          ))}
        </ul>,
      )
      return
    }

    // Ordered list
    if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
      out.push(
        <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
          {lines.map((l, j) => (
            <li key={j}>{renderInline(l.replace(/^\s*\d+\.\s+/, ""), citations, activeCitation, onCite)}</li>
          ))}
        </ol>,
      )
      return
    }

    // Paragraph (single newlines become soft breaks)
    out.push(
      <p key={i} className="text-pretty">
        {lines.map((l, j) => (
          <span key={j}>
            {renderInline(l, citations, activeCitation, onCite)}
            {j < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>,
    )
  })

  return out
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\[(\d+)\]/g

function renderInline(
  text: string,
  citations: KnowledgeCitation[],
  activeCitation: string | null,
  onCite: (id: string) => void,
): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0

  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {m[1]}
        </strong>,
      )
    } else if (m[2] !== undefined && m[3] !== undefined) {
      nodes.push(
        <a
          key={key++}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--kn-ai)] underline decoration-[var(--kn-ai)]/30 underline-offset-2 hover:decoration-[var(--kn-ai)]"
        >
          {m[2]}
        </a>,
      )
    } else if (m[4] !== undefined) {
      const marker = m[4]
      const cited = citations.find((c) => c.citationId === marker) ?? citations[Number(marker) - 1]
      nodes.push(
        <CitationMarker
          key={key++}
          marker={marker}
          active={cited ? cited.citationId === activeCitation : false}
          disabled={!cited}
          onClick={() => cited && onCite(cited.citationId)}
        />,
      )
    }
    last = INLINE.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function CitationMarker({
  marker,
  active,
  disabled,
  onClick,
}: {
  marker: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  if (disabled) {
    return <sup className="px-0.5 align-super text-[0.7em] text-muted-foreground">[{marker}]</sup>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Jump to source ${marker}`}
      className={cn(
        "mx-0.5 inline-flex -translate-y-0.5 items-center rounded-[5px] px-1 align-super text-[0.7em] font-medium tabular-nums transition-colors",
        active
          ? "bg-[var(--kn-ai)] text-primary-foreground"
          : "bg-[var(--kn-ai)]/15 text-[var(--kn-ai)] hover:bg-[var(--kn-ai)]/25",
      )}
    >
      {marker}
    </button>
  )
}

"use client"

/* ================================================================== *
 * QUESTIONS — the output of a library, not a prompt library.
 *
 * Each question is set large and attributed to the themes that
 * produced it, with the count of items that raise it without settling
 * it. That attribution is the difference between "here are some
 * questions you could ask" and "your own reading keeps asking this".
 * ================================================================== */

import type { KnowledgeQuestion, KnowledgeTheme } from "@/lib/knowledge/understand/types"
import { useReveal } from "@/lib/knowledge/understand/use-reveal"
import { Label } from "../shell/section"

export function KnowledgeQuestions({
  questions,
  themes,
  onAsk,
}: {
  questions: KnowledgeQuestion[]
  themes: KnowledgeTheme[]
  onAsk: (question: string) => void
}) {
  const { ref, revealed } = useReveal<HTMLUListElement>()
  const themeById = new Map(themes.map((t) => [t.id, t]))

  return (
    <ul ref={ref} className="border-t border-[var(--kp-rule)]">
      {questions.map((q, i) => (
        <li
          key={q.id}
          data-reveal={revealed ? "in" : "out"}
          style={{ ["--kp-delay" as string]: `${Math.min(i * 90, 450)}ms` }}
          className="border-b border-[var(--kp-rule)]"
        >
          <button
            type="button"
            onClick={() => onAsk(q.question)}
            className="group grid w-full gap-3 py-7 text-left md:grid-cols-[1fr_auto] md:items-baseline md:gap-10"
          >
            <span>
              <span className="block max-w-[24ch] text-balance font-[family-name:var(--font-fraunces)] text-[clamp(1.25rem,2.8vw,1.9rem)] font-medium leading-[1.2] tracking-[-0.02em] transition-colors duration-[var(--kp-fast)] group-hover:text-[var(--kp-accent)]">
                {q.question}
              </span>
              <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Label>Raised across</Label>
                {q.themeIds.map((id) => (
                  <span key={id} className="text-[12px] text-[var(--kp-ink-soft)]">
                    {themeById.get(id)?.label ?? id}
                  </span>
                ))}
              </span>
            </span>

            <span className="flex shrink-0 items-baseline gap-3 md:flex-col md:items-end md:gap-0">
              <span className="kp-tnum font-[family-name:var(--font-fraunces)] text-[clamp(1.5rem,3vw,2rem)] font-medium leading-none text-[var(--kp-accent)]">
                {q.supportingCount}
              </span>
              <span className="text-[12px] text-[var(--kp-ink-faint)] md:mt-1.5 md:text-right">
                items raise it,
                <br className="hidden md:inline" /> none settle it
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

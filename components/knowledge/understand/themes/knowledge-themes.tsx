"use client"

/* ================================================================== *
 * THEMES — progressive disclosure in three steps.
 *
 *   default   theme name + weight + one signal
 *   hover     concepts surface
 *   click     the cluster opens in place — never navigates away
 *
 * The type scale is DATA: a theme's size is driven by `intensity`, so
 * the list reads as a weighted map of attention before a single number
 * is read. That is the whole reason this is a list of headings rather
 * than a grid of equal cards — equal cards would assert that a theme
 * with 47 saves and one with 4 are the same kind of thing.
 * ================================================================== */

import { useState } from "react"
import type { KnowledgeConcept, KnowledgeQuestion, KnowledgeTheme } from "@/lib/knowledge/understand/types"
import { usePrefersReducedMotion } from "@/lib/knowledge/understand/use-reveal"
import { cn } from "@/lib/utils"
import { Action, Label, Reveal } from "../shell/section"

function ThemeCluster({
  theme,
  concepts,
  question,
  index,
  open,
  onToggle,
  onAsk,
}: {
  theme: KnowledgeTheme
  concepts: KnowledgeConcept[]
  question?: KnowledgeQuestion
  index: number
  open: boolean
  onToggle: () => void
  onAsk: (q: string) => void
}) {
  const reduced = usePrefersReducedMotion()
  // Clamped so the smallest theme is still comfortably readable — a
  // data-driven scale must never make real content too small to read.
  const size = 1.35 + theme.intensity * 1.15

  return (
    <Reveal as="li" delay={reduced ? 0 : Math.min(index * 70, 420)}>
      <div className="border-t border-[var(--kp-rule)]">
        <h3>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`theme-panel-${theme.id}`}
            className="group flex w-full items-baseline justify-between gap-6 py-6 text-left"
          >
            <span
              className="font-[family-name:var(--font-fraunces)] font-medium leading-[1.05] tracking-[-0.02em] transition-colors duration-[var(--kp-fast)] group-hover:text-[var(--kp-accent)]"
              style={{ fontSize: `clamp(1.5rem, ${size * 1.1}vw + 0.6rem, ${size}rem)` }}
            >
              {theme.label}
            </span>
            <span className="flex shrink-0 items-baseline gap-4">
              <span className="kp-tnum hidden text-[13px] text-[var(--kp-ink-faint)] sm:inline">
                {theme.itemCount} saved · {theme.sourceCount} sources
              </span>
              <span
                aria-hidden
                className={cn(
                  "text-[var(--kp-ink-faint)] transition-transform duration-[var(--kp-fast)]",
                  open && "rotate-45",
                )}
              >
                +
              </span>
            </span>
          </button>
        </h3>

        {/* Concepts: visible on hover/focus at rest, always visible once
            open. Hover-only disclosure would be unreachable by keyboard
            and invisible on touch, so `open` is the real affordance and
            hover is the preview. */}
        <div
          className={cn(
            "-mt-2 flex flex-wrap gap-x-2 gap-y-1.5 overflow-hidden pb-5 transition-all duration-[var(--kp-fast)]",
            open ? "max-h-40 opacity-100" : "max-h-0 opacity-0 group-hover:opacity-100 sm:max-h-10 sm:opacity-60",
          )}
        >
          {concepts.map((c) => (
            <span
              key={c.id}
              className="rounded-full border border-[var(--kp-rule)] px-2.5 py-1 text-[11.5px] text-[var(--kp-ink-soft)]"
            >
              {c.label}
            </span>
          ))}
        </div>

        <div
          id={`theme-panel-${theme.id}`}
          hidden={!open}
          className="grid gap-8 pb-9 sm:grid-cols-[1.4fr_1fr]"
        >
          <div>
            <p className="max-w-[46ch] text-[15px] leading-[1.6] text-[var(--kp-ink-soft)]">{theme.summary}</p>
            {question && (
              <div className="mt-6 border-l-2 border-[var(--kp-accent)] pl-4">
                <Label>The question it keeps raising</Label>
                <p className="mt-1.5 font-[family-name:var(--font-fraunces)] text-[17px] leading-snug">
                  {question.question}
                </p>
                <Action className="mt-2" onClick={() => onAsk(question.question)}>
                  Ask your knowledge
                </Action>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-y-5 self-start sm:grid-cols-1">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-[var(--kp-ink-faint)]">Saved items</dt>
              <dd className="kp-tnum mt-1 text-[22px] font-medium">{theme.itemCount}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-[var(--kp-ink-faint)]">Distinct sources</dt>
              <dd className="kp-tnum mt-1 text-[22px] font-medium">{theme.sourceCount}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[11px] uppercase tracking-[0.14em] text-[var(--kp-ink-faint)]">Recent activity</dt>
              <dd className="mt-1 text-[14px] text-[var(--kp-ink-soft)]">{theme.recentActivity}</dd>
            </div>
          </dl>
        </div>
      </div>
    </Reveal>
  )
}

export function KnowledgeThemes({
  themes,
  concepts,
  questions,
  onAsk,
}: {
  themes: KnowledgeTheme[]
  concepts: KnowledgeConcept[]
  questions: KnowledgeQuestion[]
  onAsk: (q: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(themes[0]?.id ?? null)
  const conceptById = new Map(concepts.map((c) => [c.id, c]))
  const questionById = new Map(questions.map((q) => [q.id, q]))

  return (
    <ul className="border-b border-[var(--kp-rule)]">
      {themes.map((theme, i) => (
        <ThemeCluster
          key={theme.id}
          theme={theme}
          index={i}
          concepts={theme.conceptIds.map((id) => conceptById.get(id)).filter((c): c is KnowledgeConcept => !!c)}
          question={theme.emergingQuestionId ? questionById.get(theme.emergingQuestionId) : undefined}
          open={openId === theme.id}
          onToggle={() => setOpenId((v) => (v === theme.id ? null : theme.id))}
          onAsk={onAsk}
        />
      ))}
    </ul>
  )
}

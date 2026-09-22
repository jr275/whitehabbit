"use client"

/* ================================================================== *
 * TIMELINE — not chronology, trajectory.
 *
 * A list of dates answers "when did I save things". This has to answer
 * "what have I been learning", so each event carries what CHANGED in
 * the library when it appeared, and the bar beneath encodes how much
 * of the library each year holds — the shape of attention over time.
 *
 * Horizontal on desktop (time reads left-to-right), vertical on mobile
 * where a horizontal scroll would hide half the story.
 * ================================================================== */

import { useState } from "react"
import type { KnowledgeObject, KnowledgeTimelineEvent } from "@/lib/knowledge/understand/types"
import { useReveal } from "@/lib/knowledge/understand/use-reveal"
import { cn } from "@/lib/utils"
import { Label } from "../shell/section"

export function KnowledgeTimeline({
  events,
  objects,
  onOpenObject,
}: {
  events: KnowledgeTimelineEvent[]
  objects: KnowledgeObject[]
  onOpenObject: (id: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const { ref, revealed } = useReveal<HTMLDivElement>()
  const objectById = new Map(objects.map((o) => [o.id, o]))

  const years = [...new Set(events.map((e) => e.year))].sort()
  const maxYearItems = Math.max(...years.map((y) => events.filter((e) => e.year === y).reduce((n, e) => n + e.itemCount, 0)), 1)

  const active = activeId ? events.find((e) => e.id === activeId) ?? null : null

  return (
    <div ref={ref}>
      <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
        {years.map((year, yi) => {
          const yearEvents = events.filter((e) => e.year === year)
          const total = yearEvents.reduce((n, e) => n + e.itemCount, 0)
          return (
            <li
              key={year}
              data-reveal={revealed ? "in" : "out"}
              style={{ ["--kp-delay" as string]: `${yi * 140}ms` }}
              className="border-t border-[var(--kp-rule-strong)] pt-5"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="kp-tnum font-[family-name:var(--font-fraunces)] text-[clamp(1.6rem,3vw,2rem)] font-medium tracking-[-0.02em]">
                  {year}
                </h3>
                <span className="kp-tnum text-[12.5px] text-[var(--kp-ink-faint)]">{total} saved</span>
              </div>

              {/* Share of the library, as a bar. Encodes the same number
                  shown above it, so the visual is redundant-by-design
                  rather than the only way to read it. */}
              <div
                aria-hidden
                className="mt-3 h-[3px] w-full overflow-hidden bg-[var(--kp-wash)]"
              >
                <div
                  className="h-full bg-[var(--kp-accent)] transition-[width] duration-[900ms] ease-[var(--kp-ease)]"
                  style={{ width: revealed ? `${(total / maxYearItems) * 100}%` : "0%", transitionDelay: `${yi * 140}ms` }}
                />
              </div>

              <ul className="mt-5 space-y-1">
                {yearEvents.map((event) => {
                  const open = activeId === event.id
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(open ? null : event.id)}
                        onMouseEnter={() => setActiveId(event.id)}
                        aria-expanded={open}
                        className={cn(
                          "w-full border-b border-[var(--kp-rule)] py-2.5 text-left transition-colors duration-[var(--kp-fast)]",
                          open ? "text-[var(--kp-accent)]" : "hover:text-[var(--kp-accent)]",
                        )}
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[15px] font-medium">{event.label}</span>
                          <span className="kp-tnum shrink-0 text-[12px] text-[var(--kp-ink-faint)]">
                            +{event.itemCount}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>

      {/* One detail panel rather than per-item expansion: the comparison
          between eras is the point, and a page of simultaneously open
          accordions destroys it. */}
      <div
        className="mt-10 min-h-[8rem] border-t border-[var(--kp-rule-strong)] pt-6"
        aria-live="polite"
      >
        {!active && (
          <p className="max-w-[52ch] text-[14px] leading-relaxed text-[var(--kp-ink-faint)]">
            Select a moment above. Each one marks not just when you saved something, but what shifted in what you
            were reading.
          </p>
        )}
        {active && (
          <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
            <div>
              <Label>
                {active.year} · {active.label}
              </Label>
              <p className="mt-2.5 max-w-[52ch] font-[family-name:var(--font-fraunces)] text-[clamp(1.05rem,2vw,1.35rem)] leading-[1.45]">
                {active.detail}
              </p>
            </div>
            {active.objectIds.length > 0 && (
              <div>
                <Label>From this period</Label>
                <ul className="mt-2.5 space-y-1.5">
                  {active.objectIds.map((id) => {
                    const object = objectById.get(id)
                    if (!object) return null
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onOpenObject(id)}
                          className="text-left text-[14px] leading-snug text-[var(--kp-ink-soft)] underline decoration-[var(--kp-rule-strong)] underline-offset-2 transition-colors hover:text-[var(--kp-accent)]"
                        >
                          {object.title}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

/* ================================================================== *
 * OBJECT DRAWER — detail without losing your place.
 *
 * Opening an item must not throw away the scroll position of a page
 * that is a narrative; that is the entire reason this is a drawer and
 * not a route.
 *
 * Its four sections are ordered by what a person actually wants after
 * clicking a title in THIS product: not the article's content (they
 * can open the source for that) but what Keeply took from it, what it
 * connects to, and why it earned its place.
 *
 * Modal behaviour is implemented rather than implied: focus moves in
 * on open, is trapped while open, returns to the trigger on close, and
 * Escape closes. A drawer that can be tabbed out of behind the scrim
 * is a keyboard trap in the other direction.
 * ================================================================== */

import { useCallback, useEffect, useRef } from "react"
import type { KnowledgeConcept, KnowledgeObject } from "@/lib/knowledge/understand/types"
import { Label } from "../shell/section"

export function ObjectDetailDrawer({
  object,
  concepts,
  related,
  onClose,
  onOpenObject,
  onAsk,
  onExploreConnections,
}: {
  object: KnowledgeObject | null
  concepts: KnowledgeConcept[]
  related: KnowledgeObject[]
  onClose: () => void
  onOpenObject: (id: string) => void
  onAsk: (question: string) => void
  onExploreConnections: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const conceptById = new Map(concepts.map((c) => [c.id, c]))

  const open = !!object

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    // Focus the panel itself rather than the first control: a screen
    // reader should hear what just opened before it hears a button.
    panelRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
      restoreTo.current?.focus?.()
    }
  }, [open])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== "Tab") return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  if (!object) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 bg-[oklch(0.19_0.012_260_/_28%)] backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kp-drawer-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="kp-understand absolute inset-x-0 bottom-0 top-16 overflow-y-auto rounded-t-2xl bg-[var(--kp-paper-raised)] shadow-[0_-8px_40px_oklch(0.19_0.012_260_/_18%)] focus:outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:w-[min(30rem,92vw)] sm:rounded-none sm:shadow-[-8px_0_40px_oklch(0.19_0.012_260_/_12%)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--kp-rule)] bg-[var(--kp-paper-raised)] px-6 py-3.5">
          <Label>Saved item</Label>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-[13px] text-[var(--kp-ink-faint)] transition-colors hover:text-[var(--kp-ink)]"
          >
            Close
          </button>
        </div>

        <div className="px-6 pb-24 pt-6">
          <h2
            id="kp-drawer-title"
            className="text-balance font-[family-name:var(--font-fraunces)] text-[clamp(1.4rem,3vw,1.75rem)] font-medium leading-[1.18] tracking-[-0.02em]"
          >
            {object.title}
          </h2>
          <p className="mt-2.5 text-[13px] text-[var(--kp-ink-faint)]">
            {object.source} · saved{" "}
            <time dateTime={object.savedAt}>
              {new Date(object.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            </time>
            {object.revisits > 0 && ` · revisited ${object.revisits}×`}
          </p>

          <section className="mt-9">
            <Label>What Keeply understood</Label>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {object.conceptIds.map((id) => (
                <li
                  key={id}
                  className="rounded-full bg-[var(--kp-wash)] px-2.5 py-1 text-[12.5px] text-[var(--kp-ink-soft)]"
                >
                  {conceptById.get(id)?.label ?? id}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-9">
            <Label>Why it matters</Label>
            <p className="mt-3 border-l-2 border-[var(--kp-accent)] pl-4 font-[family-name:var(--font-fraunces)] text-[16px] leading-[1.55]">
              {object.insight}
            </p>
          </section>

          {related.length > 0 && (
            <section className="mt-9">
              <Label>Connected knowledge</Label>
              <ul className="mt-3 divide-y divide-[var(--kp-rule)] border-y border-[var(--kp-rule)]">
                {related.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onOpenObject(r.id)}
                      className="group w-full py-3 text-left"
                    >
                      <span className="block text-[14px] font-medium leading-snug transition-colors group-hover:text-[var(--kp-accent)]">
                        {r.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-[var(--kp-ink-faint)]">
                        {r.source} · shares{" "}
                        {r.conceptIds
                          .filter((id) => object.conceptIds.includes(id))
                          .map((id) => conceptById.get(id)?.label)
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAsk(`What did I learn from “${object.title}”?`)}
              className="rounded-full bg-[var(--kp-ink)] px-4 py-2 text-[13px] font-medium text-[var(--kp-paper)] transition-colors hover:bg-[var(--kp-accent)]"
            >
              Ask about this
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                onExploreConnections()
              }}
              className="rounded-full border border-[var(--kp-rule-strong)] px-4 py-2 text-[13px] font-medium transition-colors hover:border-[var(--kp-accent)] hover:text-[var(--kp-accent)]"
            >
              Explore connections
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

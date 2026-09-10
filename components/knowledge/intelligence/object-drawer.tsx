"use client"

import { Sparkles, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef } from "react"
import { askAboutHref } from "@/lib/knowledge/config"
import type { DrawerObject } from "@/lib/knowledge/intelligence/types"
import { Chip } from "./shared"

/**
 * Shared detail drawer. Any intelligence surface normalizes its selected
 * item into a {@link DrawerObject} and hands it here, so the drawer stays
 * decoupled from concepts / insights / gaps / etc.
 *
 * The "Ask about this" action routes into the REAL, existing Ask surface
 * via `askAboutHref` — it pre-fills the composer and never fabricates an
 * answer, matching how the rest of the app links into Ask.
 */
export function ObjectDrawer({ object, onClose }: { object: DrawerObject | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const open = object !== null

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!object) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${object.kind}: ${object.title}`}>
      <button
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-[var(--kn-edge)] bg-[var(--kn-paper)] shadow-2xl duration-200 animate-in slide-in-from-right">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--kn-edge)] px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--kn-ai)]">{object.kind}</p>
            <h2 className="mt-1 text-balance font-serif text-2xl font-medium leading-tight tracking-tight text-foreground">
              {object.title}
            </h2>
            {object.subtitle && <p className="mt-1 text-sm text-muted-foreground">{object.subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {object.chips.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              {object.chips.map((c, i) => (
                <Chip key={i} tone={c.tone}>
                  {c.label}
                </Chip>
              ))}
            </div>
          )}

          <div className="space-y-5">
            {object.sections.map((s, i) => (
              <section key={i}>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.heading}</h3>
                <p className="mt-2 text-pretty text-[15px] leading-relaxed text-foreground/90">{s.body}</p>
              </section>
            ))}

            {object.relatedLabels && object.relatedLabels.length > 0 && (
              <section>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Related</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {object.relatedLabels.map((r) => (
                    <Chip key={r}>{r}</Chip>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {object.ask && (
          <div className="border-t border-[var(--kn-edge)] px-6 py-4">
            <Link
              href={askAboutHref(object.ask)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.01] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kn-paper)]"
            >
              <Sparkles className="size-4" /> Ask about this
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

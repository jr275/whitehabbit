"use client"

/* ================================================================== *
 * CONNECTIONS — relationships you walk, not a network picture.
 *
 * This was a radial SVG: concept discs on a ring, joined by lines,
 * with a panel of text beside it. It had the two problems every
 * force-graph-shaped UI has. A ring of labelled dots answers "is my
 * knowledge connected?" (yes, visibly) but not the question anyone
 * actually arrives with, which is "connected HOW, and through what?".
 * And at four concepts it looked like a diagram of nothing, while at
 * two hundred it would have looked like wool.
 *
 * What replaced it is the same data as a path you move along:
 *
 *   AGENT MEMORY                                          4 pieces
 *     ↳ related to  TOOL CALLING            2 pieces share both
 *     ↳ related to  AGENT PROTOCOLS          1 piece shares both
 *
 * Click a neighbour and it becomes the new centre, so a reader walks
 * their own library one real relationship at a time. The pieces behind
 * the current step are listed underneath, by name — the edge is never
 * an assertion you have to take on trust.
 *
 * NOTHING HERE IS INVENTED. Every step is a pair of concepts that a
 * real saved item carries both of; the weight is how many items do;
 * the listed pieces are those items. An edge with no items cannot
 * exist, because the edges are built from the items (see
 * lib/knowledge/understand/connections.ts).
 * ================================================================== */

import { useEffect, useMemo, useState } from "react"
import type { KnowledgeConcept, KnowledgeConnection, KnowledgeObject } from "@/lib/knowledge/understand/types"
import { Label } from "../shell/section"
import { useT } from "../../i18n"

interface Step {
  concept: KnowledgeConcept
  coOccurrences: number
  objectIds: string[]
  evidence: string
}

export function KnowledgeGraph({
  concepts,
  connections,
  objects,
  onOpenObject,
}: {
  concepts: KnowledgeConcept[]
  connections: KnowledgeConnection[]
  objects: KnowledgeObject[]
  onOpenObject: (id: string) => void
}) {
  const t = useT()
  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts])
  const objectById = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])

  /** The heaviest concept is the default centre, so the page opens on
   *  the reader's strongest thread rather than on an empty prompt. */
  const defaultId = useMemo(
    () => [...concepts].sort((a, b) => b.itemCount - a.itemCount || a.id.localeCompare(b.id))[0]?.id ?? null,
    [concepts],
  )
  const [centreId, setCentreId] = useState<string | null>(defaultId)

  // The concept set changes when the viewer's library loads. Re-centre
  // rather than keep pointing at an id that is no longer in the list.
  useEffect(() => {
    setCentreId((current) => (current && conceptById.has(current) ? current : defaultId))
  }, [conceptById, defaultId])

  const centre = centreId ? conceptById.get(centreId) : null

  /** The steps out of the current concept, strongest first. */
  const steps: Step[] = useMemo(() => {
    if (!centreId) return []
    return connections
      .filter((c) => c.sourceId === centreId || c.targetId === centreId)
      .map((c) => {
        const otherId = c.sourceId === centreId ? c.targetId : c.sourceId
        const concept = conceptById.get(otherId)
        return concept
          ? { concept, coOccurrences: c.coOccurrences, objectIds: c.objectIds, evidence: c.evidence }
          : null
      })
      .filter((s): s is Step => s !== null)
      .sort((a, b) => b.coOccurrences - a.coOccurrences || a.concept.label.localeCompare(b.concept.label))
  }, [centreId, connections, conceptById])

  if (concepts.length === 0) {
    return (
      <p className="max-w-[54ch] text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">
        {t.understand.noConnectionsYet}
      </p>
    )
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-16">
      {/* ── Where you can start ─────────────────────────────────── */}
      <div>
        <Label>{t.understand.concepts}</Label>
        <ul className="pk-rows mt-4">
          {[...concepts]
            .sort((a, b) => b.itemCount - a.itemCount || a.label.localeCompare(b.label))
            .map((c) => {
              const active = c.id === centreId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setCentreId(c.id)}
                    aria-current={active ? "true" : undefined}
                    className="flex w-full items-baseline justify-between gap-4 border-b border-[var(--pk-rule)] py-2.5 text-left transition-colors hover:bg-[var(--pk-sunken)]"
                  >
                    <span
                      className={
                        active
                          ? "truncate text-[15px] font-medium text-[var(--pk-ink)]"
                          : "truncate text-[15px] text-[var(--pk-ink-3)]"
                      }
                    >
                      {c.label}
                    </span>
                    <span className="pk-meta pk-num shrink-0">{c.itemCount}</span>
                  </button>
                </li>
              )
            })}
        </ul>
      </div>

      {/* ── The path ────────────────────────────────────────────── */}
      <div>
        {centre && (
          <>
            <Label>{t.understand.relatedTo}</Label>
            <h3 className="pk-title mt-4 text-[var(--pk-ink)]">{centre.label}</h3>
            <p className="pk-meta mt-2">
              {centre.itemCount} {centre.itemCount === 1 ? "piece" : "pieces"} in your library
            </p>

            {steps.length === 0 ? (
              <p className="mt-8 max-w-[52ch] text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">
                {t.understand.noConnectionForIdea}
              </p>
            ) : (
              <ol className="mt-8 flex flex-col">
                {steps.map((step) => (
                  <li
                    key={step.concept.id}
                    className="border-t border-[var(--pk-rule)] py-5 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-baseline gap-3">
                      <span aria-hidden className="pk-label shrink-0 text-[var(--pk-signal)]">
                        ↳
                      </span>
                      <button
                        type="button"
                        onClick={() => setCentreId(step.concept.id)}
                        className="text-left text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4 transition-colors hover:decoration-[var(--pk-ink)]"
                      >
                        {step.concept.label}
                      </button>
                      <span className="pk-meta pk-num ml-auto shrink-0">
                        {step.coOccurrences} {step.coOccurrences === 1 ? "piece" : "pieces"}
                      </span>
                    </div>

                    {/* The reason, assembled from the stored rows — so it
                        wears the evidence signal rather than the
                        generated-content one. */}
                    <p className="pk-evidence ml-8 mt-3 max-w-[52ch] text-[13px] leading-[1.6]">{step.evidence}</p>

                    <ul className="ml-8 mt-3 flex flex-col gap-1.5">
                      {step.objectIds.map((id) => {
                        const object = objectById.get(id)
                        if (!object) return null
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              onClick={() => onOpenObject(id)}
                              className="pk-meta text-left transition-colors hover:text-[var(--pk-ink)]"
                            >
                              {object.title}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}

"use client"

/* ================================================================== *
 * OBJECT INSPECTOR (Phase UI-1/4/5, docs/ontology-ui-architecture-v1.md
 * §2) — the universal, reusable right-side panel every ontology
 * surface (Knowledge Explorer, Opportunity list, Page list, Agent
 * runs) opens instead of forcing a full-page navigation. Reads the
 * one shared GET /api/v1/objects/:type/:id endpoint
 * (lib/ontology/object-resolver.ts) — never a per-surface, one-off
 * detail fetch. Clicking a real relationship row traverses to that
 * object *inside* the same panel (a real navigation stack with a
 * back button), matching the brief's "the user should not constantly
 * have to return to the sidebar."
 * ================================================================== */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, X } from "lucide-react"
import type { ObjectDetail, ObjectType } from "@/lib/ontology/object-resolver"
import { ObjectTypeBadge, ObjectStatusBadge } from "./object-badge"
import { Score } from "./score"
import { LoadingState, ErrorState } from "./states"

interface Ref {
  type: ObjectType
  id: string
}

export function useObjectInspector() {
  const [stack, setStack] = useState<Ref[]>([])
  return {
    open: (ref: Ref) => setStack([ref]),
    close: () => setStack([]),
    isOpen: stack.length > 0,
    stack,
    setStack,
  }
}

export function ObjectInspector({ stack, setStack, onClose }: { stack: Ref[]; setStack: (s: Ref[]) => void; onClose: () => void }) {
  const current = stack[stack.length - 1]
  const [detail, setDetail] = useState<ObjectDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!current) return
    setDetail(null)
    setError(null)
    fetch(`/api/v1/objects/${current.type}/${current.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load this object."))))
      .then((body) => setDetail(body.object))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this object."))
  }, [current?.type, current?.id])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  if (!current) return null

  function pushRelated(type: string, id: string) {
    // Only real, known Object Types resolve into the inspector — an
    // edge whose node_type isn't one of the five real types this
    // resolver covers (e.g. a raw "market"/"query" node id from
    // opportunity_graph_edges) stays a label, not a broken link.
    const KNOWN: ObjectType[] = ["entity", "opportunity", "page", "decision", "agent_run", "observation"]
    if (KNOWN.includes(type as ObjectType)) setStack([...stack, { type: type as ObjectType, id }])
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/50" onClick={onClose} role="presentation">
      <aside role="dialog" aria-modal="true" aria-label="Object inspector" className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {stack.length > 1 && (
            <button onClick={() => setStack(stack.slice(0, -1))} aria-label="Back" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
              <ArrowLeft className="size-4" />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{stack.map((s) => s.id).join(" › ")}</span>
          <button onClick={onClose} aria-label="Close inspector" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-5"><ErrorState title="Could not load this object" body={error} /></div>
          ) : !detail ? (
            <div className="p-5"><LoadingState /></div>
          ) : (
            <div className="flex flex-col gap-6 p-5">
              {/* IDENTITY */}
              <div>
                <ObjectTypeBadge type={detail.type} />
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.01em]">{detail.title}</h2>
                {detail.subtitle && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{detail.subtitle}</p>}
                <div className="mt-3 flex items-center gap-4">
                  <ObjectStatusBadge status={detail.status} />
                  {(detail.score != null || detail.confidence != null) && (
                    <div className="flex items-center gap-3">
                      {detail.score != null && <Score value={detail.score} label="score" />}
                      {detail.confidence != null && <Score value={detail.confidence * 100} label="confidence" />}
                    </div>
                  )}
                </div>
              </div>

              {/* PROPERTIES */}
              {detail.properties.some((p) => p.value != null) && (
                <Section title="Properties">
                  <dl className="flex flex-col gap-2">
                    {detail.properties.filter((p) => p.value != null).map((p) => (
                      <div key={p.label} className="flex items-start justify-between gap-3 text-[12.5px]">
                        <dt className="shrink-0 text-muted-foreground">{p.label}</dt>
                        <dd className="text-right text-foreground">{p.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              )}

              {/* RELATIONSHIPS */}
              <Section title={`Relationships${detail.relationships.length ? ` (${detail.relationships.length})` : ""}`}>
                {detail.relationships.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">No real relationships recorded yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {detail.relationships.map((r, i) => {
                      const clickable = ["entity", "opportunity", "page", "decision", "agent_run", "observation"].includes(r.targetType)
                      return (
                        <li key={`${r.relation}:${r.targetId}:${i}`}>
                          <button
                            onClick={() => clickable && pushRelated(r.targetType, r.targetId)}
                            disabled={!clickable}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] ${clickable ? "text-foreground transition-colors hover:bg-secondary/60" : "cursor-default text-muted-foreground"}`}
                          >
                            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-primary">{r.relation.replaceAll("_", " ")}</span>
                            <span className="min-w-0 flex-1 truncate">{r.targetLabel}</span>
                            <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{r.targetType}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              {/* EVIDENCE */}
              <Section title={`Evidence${detail.evidence.length ? ` (${detail.evidence.length})` : ""}`}>
                {detail.evidence.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">No real supporting evidence recorded yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {detail.evidence.slice(0, 8).map((e) => (
                      <li key={e.id} className="text-[12.5px] leading-relaxed">
                        {e.fact && <p className="text-foreground">{e.fact}</p>}
                        <p className="mt-0.5 flex items-center gap-2 text-muted-foreground">
                          <span>{e.source}</span>
                          {e.confidence != null && <span>· {Math.round(e.confidence * 100)}% confidence</span>}
                          {e.verificationStatus && <span>· {e.verificationStatus}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* HISTORY */}
              {detail.history.length > 0 && (
                <Section title="History">
                  <ol className="flex flex-col gap-1.5">
                    {detail.history.map((h, i) => (
                      <li key={i} className="flex items-center justify-between text-[12px]">
                        <span className="text-foreground">{h.label}</span>
                        <span className="font-mono text-muted-foreground">{new Date(h.at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* ACTIONS */}
              <Section title="Actions">
                <div className="flex flex-col gap-2">
                  {detail.actions.map((a, i) =>
                    a.kind === "unavailable" ? (
                      <p key={i} className="text-[12.5px] text-muted-foreground">{a.label}</p>
                    ) : (
                      <Link key={i} href={a.href ?? "#"} className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90">
                        {a.label} <ArrowUpRight className="size-3.5" />
                      </Link>
                    ),
                  )}
                </div>
              </Section>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

"use client"

/* ================================================================== *
 * OBJECT INSPECTOR (Phase UI-1/4/5; visual language per
 * docs/remax-knowledge-design-reference.md) — the universal, reusable
 * object panel every ontology surface (Mission Control, Knowledge
 * Explorer, Opportunity list, Page list, Agent runs) opens instead of
 * forcing a full-page navigation. Reads the one shared
 * GET /api/v1/objects/:type/:id endpoint (lib/ontology/object-resolver.ts)
 * — never a per-surface, one-off detail fetch. Clicking a real
 * relationship row traverses to that object *inside* the same panel (a
 * real navigation stack with a back button).
 *
 * Two render variants, same real content:
 *   - "overlay" (default) — the existing fixed, backdrop-dimmed drawer,
 *     used wherever the Inspector opens over an already-established
 *     full-page layout (Knowledge Explorer, Opportunities/Pages lists).
 *   - "docked" — no backdrop, no fixed positioning: renders as a plain
 *     `h-full` panel meant to sit inline, side by side with a graph
 *     canvas, in the same continuous surface — never a "dialog on top
 *     of the workspace" (the RE/MAX Knowledge reference's own object+
 *     graph composition, docs/remax-knowledge-design-reference.md §1.5).
 *     Used by Mission Control's Campo de Inteligência.
 *
 * Composition is a dense operational "identity card": a compact
 * 3-element header line (type + name + status), a key-metrics strip, a
 * real "Leitura explicável" prose section (never a bare number), thin
 * `divide-y` section separators, and a `sticky bottom-0` action footer.
 * ================================================================== */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, X } from "lucide-react"
import type { ObjectDetail, ObjectType } from "@/lib/ontology/object-resolver"
import { ObjectTypeBadge, ObjectStatusBadge } from "./object-badge"
import { LoadingState, ErrorState } from "./states"
import { ExplainabilityNote } from "./explainability-note"
import { explainObjectDetail } from "@/lib/ontology/explain"
import { translateObjectType, translateRelation, translateSource, translateVerification } from "@/lib/ontology/pt-br"

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

const KNOWN: ObjectType[] = ["entity", "opportunity", "page", "decision", "agent_run", "observation"]

interface InspectorContentProps {
  stack: Ref[]
  setStack: (s: Ref[]) => void
  onClose: () => void
}

function InspectorContent({ stack, setStack, onClose }: InspectorContentProps) {
  const current = stack[stack.length - 1]
  const [detail, setDetail] = useState<ObjectDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!current) return
    setDetail(null)
    setError(null)
    fetch(`/api/v1/objects/${current.type}/${current.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Não foi possível carregar este objeto."))))
      .then((body) => setDetail(body.object))
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar este objeto."))
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
    // edge whose node_type isn't one of the six real types this
    // resolver covers (e.g. a raw "market"/"query" node id from
    // opportunity_graph_edges) stays a label, not a broken link.
    if (KNOWN.includes(type as ObjectType)) setStack([...stack, { type: type as ObjectType, id }])
  }

  const relCount = detail?.relationships.length ?? 0
  const evCount = detail?.evidence.length ?? 0

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        {stack.length > 1 && (
          <button onClick={() => setStack(stack.slice(0, -1))} aria-label="Voltar" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ArrowLeft className="size-4" />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{stack.map((s) => s.id).join(" › ")}</span>
        <button onClick={onClose} aria-label="Fechar inspetor" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>

      {error ? (
        <div className="flex-1 overflow-y-auto p-4">
          <ErrorState title="Não foi possível carregar este objeto" body={error} />
        </div>
      ) : !detail ? (
        <div className="flex-1 overflow-y-auto p-4">
          <LoadingState />
        </div>
      ) : (
        <>
          {/* IDENTITY — one dense line: type + name + status, never
           * stacked. Serif for the object's own name (Object UI,
           * docs/remax-knowledge-design-reference.md §1.2) — the one
           * typographic signal that separates an object's real
           * identity from a UI label. */}
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ObjectTypeBadge type={detail.type} />
              <h2 className="min-w-0 flex-1 truncate font-serif text-[19px] font-medium tracking-[-0.01em]">{detail.title}</h2>
              <ObjectStatusBadge status={detail.status} />
            </div>
            {detail.subtitle && <p className="mt-1 truncate text-[12.5px] leading-relaxed text-muted-foreground">{detail.subtitle}</p>}
          </div>

          {/* KEY METRICS — horizontal mini-grid strip, mono numbers,
           * thin dividers instead of separate cards. */}
          {(detail.score != null || detail.confidence != null || relCount > 0 || evCount > 0) && (
            <div className="grid shrink-0 grid-cols-4 divide-x divide-border border-b border-border text-center">
              <MetricCell label="pontuação" value={detail.score} />
              <MetricCell label="confiança" value={detail.confidence != null ? detail.confidence * 100 : null} />
              <MetricCell label="relações" value={relCount} />
              <MetricCell label="evidências" value={evCount} />
            </div>
          )}

          {/* LEITURA EXPLICÁVEL — a score/state is never shown bare
           * (docs/remax-knowledge-design-reference.md §1.3). */}
          <ExplainabilityNote text={explainObjectDetail(detail)} />

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col divide-y divide-border/60">
              {/* PROPERTIES — dense 2-column grid, reduced vertical gap. */}
              {detail.properties.some((p) => p.value != null) && (
                <Section title="Propriedades">
                  <dl className="flex flex-col gap-1.5">
                    {detail.properties
                      .filter((p) => p.value != null)
                      .map((p) => (
                        <div key={p.label} className="flex items-start justify-between gap-3 text-[12.5px]">
                          <dt className="shrink-0 text-muted-foreground">{p.label}</dt>
                          <dd className="text-right text-foreground">{p.value}</dd>
                        </div>
                      ))}
                  </dl>
                </Section>
              )}

              {/* RELATIONSHIPS — aggregate count in the section title;
               * each row is two lines (relation label bold on top,
               * target name + type muted below) — never a single dense
               * line (docs/remax-knowledge-design-reference.md §1.9). */}
              <Section title={`Relacionamentos${relCount ? ` (${relCount})` : ""}`}>
                {relCount === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">Nenhum relacionamento real registrado ainda.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {detail.relationships.map((r, i) => {
                      const clickable = KNOWN.includes(r.targetType as ObjectType)
                      return (
                        <li key={`${r.relation}:${r.targetId}:${i}`}>
                          <button
                            onClick={() => clickable && pushRelated(r.targetType, r.targetId)}
                            disabled={!clickable}
                            className={`flex w-full flex-col gap-0.5 rounded-md bg-card/60 px-3 py-2 text-left ${clickable ? "text-foreground transition-colors hover:bg-secondary/60" : "cursor-default"}`}
                          >
                            <span className="text-[12.5px] font-medium">{translateRelation(r.relation)}</span>
                            <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                              <span className="min-w-0 truncate">{r.targetLabel}</span>
                              <span className="shrink-0 font-mono text-[9px] uppercase">· {translateObjectType(r.targetType)}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              {/* EVIDENCE — one compact line per item: fact, then
               * fonte/confiança/verificação as smaller mono metadata. */}
              <Section title={`Evidências${evCount ? ` (${evCount})` : ""}`}>
                {evCount === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">Nenhuma evidência real registrada ainda.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {detail.evidence.slice(0, 8).map((e) => (
                      <li key={e.id} className="text-[12.5px] leading-snug">
                        {e.fact && <p className="text-foreground">{e.fact}</p>}
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-[10.5px] text-muted-foreground">
                          <span>{translateSource(e.source)}</span>
                          {e.confidence != null && <span>· {Math.round(e.confidence * 100)}% de confiança</span>}
                          {e.verificationStatus && <span>· {translateVerification(e.verificationStatus)}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* HISTORY */}
              {detail.history.length > 0 && (
                <Section title="Histórico">
                  <ol className="flex flex-col gap-1">
                    {detail.history.map((h, i) => (
                      <li key={i} className="flex items-center justify-between text-[12px]">
                        <span className="text-foreground">{h.label}</span>
                        <span className="font-mono text-muted-foreground">{new Date(h.at).toLocaleString("pt-BR")}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </div>
          </div>

          {/* ACTIONS — sticky footer, always visible regardless of
           * scroll position. */}
          <div className="sticky bottom-0 shrink-0 border-t border-border bg-popover px-4 py-3">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Ações</p>
            <div className="flex flex-wrap gap-2">
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
          </div>
        </>
      )}
    </>
  )
}

export function ObjectInspector({ stack, setStack, onClose, variant = "overlay" }: InspectorContentProps & { variant?: "overlay" | "docked" }) {
  if (stack.length === 0) return null

  if (variant === "docked") {
    return (
      <aside role="region" aria-label="Inspetor de objeto" className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-popover">
        <InspectorContent stack={stack} setStack={setStack} onClose={onClose} />
      </aside>
    )
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/50 sm:items-stretch" onClick={onClose} role="presentation">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Inspetor de objeto"
        className="flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl border-t border-border bg-popover shadow-2xl sm:h-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
        onClick={(e) => e.stopPropagation()}
      >
        <InspectorContent stack={stack} setStack={setStack} onClose={onClose} />
      </aside>
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="px-2 py-2">
      <span className="block font-mono text-sm tabular-nums text-foreground">{value != null ? Math.round(value) : "—"}</span>
      <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </section>
  )
}

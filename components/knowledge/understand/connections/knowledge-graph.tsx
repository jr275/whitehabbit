"use client"

/* ================================================================== *
 * CONNECTIONS — a semantic graph, not a network picture.
 *
 * Three rules make this different from the usual decorative force
 * graph, and each is enforced by the data rather than by discipline:
 *
 *  1. EVERY EDGE MEANS SOMETHING. `evidence` is required on the type,
 *     and the edge label is the count of saved items mentioning both
 *     ends — derived in demo-data.ts, never asserted.
 *  2. LAYOUT IS DETERMINISTIC. A radial arrangement ordered by concept
 *     weight, computed from the data. No simulation, no randomness, no
 *     animation loop — the same library always draws the same map, so
 *     a person can build spatial memory of their own knowledge.
 *  3. REACT OWNS STATE. Selection, focus and hover live in React; the
 *     SVG is a pure function of them. No library mutates the DOM here.
 *
 * ACCESSIBILITY: the drawn marks are decoration (aria-hidden); a real
 * <button> per concept sits over each one, so Tab reaches them, arrow
 * keys walk the ring, and selection follows focus. Every relationship
 * the picture encodes is also stated in text beside it — that panel is
 * not a supplement to the graphic, it is the same information, and it
 * is what a screen reader gets.
 * ================================================================== */

import { useMemo, useState } from "react"
import type { KnowledgeConcept, KnowledgeConnection, KnowledgeObject } from "@/lib/knowledge/understand/types"
import { usePrefersReducedMotion, useReveal } from "@/lib/knowledge/understand/use-reveal"
import { cn } from "@/lib/utils"
import { Label } from "../shell/section"

const VIEW = 720
const CENTER = VIEW / 2
const RADIUS = 250

interface Placed extends KnowledgeConcept {
  x: number
  y: number
  r: number
}

/** Deterministic radial layout. Concepts are ordered by weight and
 *  spread evenly; the heaviest sits at the top so the map has a stable
 *  "north" a reader can orient by. */
function layout(concepts: KnowledgeConcept[]): Placed[] {
  const ordered = [...concepts].sort((a, b) => b.itemCount - a.itemCount)
  const max = Math.max(...ordered.map((c) => c.itemCount), 1)
  return ordered.map((c, i) => {
    const angle = (i / ordered.length) * Math.PI * 2 - Math.PI / 2
    return {
      ...c,
      x: CENTER + Math.cos(angle) * RADIUS,
      y: CENTER + Math.sin(angle) * RADIUS,
      r: 16 + (c.itemCount / max) * 20,
    }
  })
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const reduced = usePrefersReducedMotion()
  const { ref, revealed } = useReveal<HTMLDivElement>({ threshold: 0.2 })

  const nodes = useMemo(() => layout(concepts), [concepts])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const objectById = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])

  const maxCo = Math.max(...connections.map((c) => c.coOccurrences), 1)

  const related = useMemo(() => {
    if (!selectedId) return null
    const edges = connections.filter((c) => c.sourceId === selectedId || c.targetId === selectedId)
    const neighbours = new Set(edges.map((e) => (e.sourceId === selectedId ? e.targetId : e.sourceId)))
    const objectIds = [...new Set(edges.flatMap((e) => e.objectIds))]
    return { edges, neighbours, objectIds }
  }, [selectedId, connections])

  const selected = selectedId ? nodeById.get(selectedId) : null

  function isDimmed(id: string) {
    if (!related) return false
    return id !== selectedId && !related.neighbours.has(id)
  }

  /** Arrow keys walk the ring. Selection follows focus, which is the
   *  expected behaviour for a single-select group and means a keyboard
   *  reader gets the same "select and see why" loop a mouse does. */
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1
    const next = nodes[(index + delta + nodes.length) % nodes.length]
    setSelectedId(next.id)
    document.getElementById(`kp-node-${next.id}`)?.focus()
  }

  return (
    <div ref={ref} className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
      {/* ---- the map ---- */}
      <div className="order-2 lg:order-1">
        {/* The SVG draws; real buttons handle interaction.
         *
         * An SVG <g> with tabIndex is not reliably focusable across
         * browsers, and a graph whose nodes cannot be reached by
         * keyboard is not an accessible graph no matter what ARIA it
         * carries — verified in a browser, where focus() on the group
         * simply did not land. So the marks stay decorative
         * (aria-hidden) and a native <button> sits over each one,
         * positioned from the SAME layout maths, which keeps the hit
         * target and the drawn circle in permanent agreement. */}
        <div className="relative w-full max-w-[560px]">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="h-auto w-full max-w-[560px] select-none"
          role="group"
          aria-label="Concept relationship map. The same relationships are listed as text beside this graphic."
        >
          <g aria-hidden>
            {connections.map((edge, i) => {
              const a = nodeById.get(edge.sourceId)
              const b = nodeById.get(edge.targetId)
              if (!a || !b) return null
              const active = !!related && (edge.sourceId === selectedId || edge.targetId === selectedId)
              const dim = !!related && !active
              return (
                <line
                  key={edge.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={active ? "var(--kp-accent)" : "var(--kp-signal)"}
                  strokeWidth={0.6 + (edge.coOccurrences / maxCo) * 2.6}
                  strokeLinecap="round"
                  opacity={dim ? 0.07 : active ? 0.85 : 0.28}
                  style={{
                    transition: reduced ? undefined : `opacity var(--kp-fast) var(--kp-ease), stroke var(--kp-fast)`,
                    // Edges draw in sequence as the section enters, so the
                    // map assembles rather than appearing finished.
                    strokeDasharray: reduced ? undefined : 600,
                    strokeDashoffset: reduced ? undefined : revealed ? 0 : 600,
                    transitionDelay: reduced ? undefined : `${Math.min(i * 40, 500)}ms`,
                    transitionProperty: reduced ? undefined : "opacity, stroke, stroke-dashoffset",
                    transitionDuration: reduced ? undefined : "var(--kp-fast), var(--kp-fast), 900ms",
                  }}
                />
              )
            })}
          </g>

          <g aria-hidden>
            {nodes.map((n) => {
              const isSelected = n.id === selectedId
              const dim = isDimmed(n.id)
              return (
                <g
                  key={n.id}
                  style={{
                    opacity: dim ? 0.22 : 1,
                    transition: reduced ? undefined : "opacity var(--kp-fast) var(--kp-ease)",
                  }}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={isSelected ? "var(--kp-accent)" : "var(--kp-paper-raised)"}
                    stroke={isSelected ? "var(--kp-accent)" : "var(--kp-rule-strong)"}
                    strokeWidth={1.5}
                  />
                  <text
                    x={n.x}
                    y={n.y + n.r + 18}
                    textAnchor="middle"
                    style={{
                      fontSize: 15,
                      fontWeight: isSelected ? 600 : 500,
                      fill: isSelected ? "var(--kp-accent)" : "var(--kp-ink)",
                    }}
                  >
                    {n.label}
                  </text>
                  <text
                    x={n.x}
                    y={n.y + 5}
                    textAnchor="middle"
                    style={{
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      fill: isSelected ? "var(--kp-paper)" : "var(--kp-ink-faint)",
                    }}
                  >
                    {n.itemCount}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

          <ul role="list" className="pointer-events-none absolute inset-0">
            {nodes.map((n, i) => {
              const isSelected = n.id === selectedId
              return (
                <li key={n.id}>
                  <button
                    id={`kp-node-${n.id}`}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${n.label}, found in ${n.itemCount} saved items${isSelected ? ", selected" : ""}`}
                    onClick={() => setSelectedId(isSelected ? null : n.id)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    style={{
                      left: `${(n.x / VIEW) * 100}%`,
                      top: `${(n.y / VIEW) * 100}%`,
                      width: `${(n.r * 2.2 / VIEW) * 100}%`,
                      height: `${(n.r * 2.2 / VIEW) * 100}%`,
                    }}
                    className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  >
                    <span className="sr-only">{n.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="mt-4 max-w-[46ch] text-[12.5px] leading-relaxed text-[var(--kp-ink-faint)]">
          Circle size is how many saved items contain the concept. Line weight is how often two appear together.
          Select a concept — with a click or the arrow keys — to see what connects it.
        </p>
      </div>

      {/* ---- the same information, as text ---- */}
      <div className="order-1 lg:order-2 lg:pt-4">
        {!selected && (
          <div>
            <Label>Strongest relationships</Label>
            <ul className="mt-4 divide-y divide-[var(--kp-rule)] border-y border-[var(--kp-rule)]">
              {connections.slice(0, 5).map((edge) => (
                <li key={edge.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(edge.sourceId)}
                    className="group w-full py-3.5 text-left"
                  >
                    <span className="font-[family-name:var(--font-fraunces)] text-[17px] transition-colors group-hover:text-[var(--kp-accent)]">
                      {nodeById.get(edge.sourceId)?.label} ↔ {nodeById.get(edge.targetId)?.label}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-[var(--kp-ink-faint)]">{edge.evidence}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selected && related && (
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <Label>Selected concept</Label>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-[12px] text-[var(--kp-ink-faint)] underline-offset-4 hover:text-[var(--kp-ink)] hover:underline"
              >
                Clear
              </button>
            </div>

            <h3 className="mt-2 font-[family-name:var(--font-fraunces)] text-[clamp(1.6rem,3vw,2.1rem)] font-medium tracking-[-0.02em]">
              {selected.label}
            </h3>
            <p className="mt-1.5 text-[14px] text-[var(--kp-ink-soft)]">
              Found in <span className="kp-tnum font-medium">{selected.itemCount}</span> saved items, connected to{" "}
              <span className="kp-tnum font-medium">{related.neighbours.size}</span> other concepts.
            </p>

            <div className="mt-7">
              <Label>Why these are connected</Label>
              <ul className="mt-3 space-y-2.5">
                {related.edges
                  .sort((a, b) => b.coOccurrences - a.coOccurrences)
                  .map((edge) => {
                    const otherId = edge.sourceId === selected.id ? edge.targetId : edge.sourceId
                    return (
                      <li key={edge.id} className="flex items-baseline gap-3">
                        <span className="kp-tnum mt-0.5 w-6 shrink-0 text-right text-[13px] font-medium text-[var(--kp-accent)]">
                          {edge.coOccurrences}
                        </span>
                        <span className="text-[14px] leading-snug text-[var(--kp-ink-soft)]">
                          saved item{edge.coOccurrences === 1 ? "" : "s"} mention both{" "}
                          <strong className="font-medium text-[var(--kp-ink)]">{selected.label}</strong> and{" "}
                          <button
                            type="button"
                            onClick={() => setSelectedId(otherId)}
                            className="font-medium text-[var(--kp-ink)] underline decoration-[var(--kp-rule-strong)] underline-offset-2 hover:text-[var(--kp-accent)]"
                          >
                            {nodeById.get(otherId)?.label}
                          </button>
                        </span>
                      </li>
                    )
                  })}
              </ul>
            </div>

            <div className="mt-7">
              <Label>The saved items behind it</Label>
              <ul className="mt-3 divide-y divide-[var(--kp-rule)] border-y border-[var(--kp-rule)]">
                {related.objectIds.slice(0, 6).map((id) => {
                  const object = objectById.get(id)
                  if (!object) return null
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onOpenObject(id)}
                        className={cn("group w-full py-3 text-left")}
                      >
                        <span className="block text-[14px] font-medium leading-snug transition-colors group-hover:text-[var(--kp-accent)]">
                          {object.title}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-[var(--kp-ink-faint)]">{object.source}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

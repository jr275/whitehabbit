"use client"

import { useMemo, useState } from "react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import type { DrawerObject, EdgeKind, GraphNode } from "@/lib/knowledge/intelligence/types"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { cn } from "@/lib/utils"
import { PanelError, PanelHeading, PanelSkeleton } from "../shared"

const EDGE_COLOR: Record<EdgeKind, string> = {
  supports: "var(--kn-ai)",
  extends: "oklch(0.7 0.15 160)",
  relates: "oklch(0.6 0.02 260)",
  contradicts: "oklch(0.7 0.17 40)",
}

const EDGE_LABEL: Record<EdgeKind, string> = {
  supports: "Supports",
  extends: "Extends",
  relates: "Relates",
  contradicts: "Contradicts",
}

export function ConnectionsPanel({ onOpen }: { onOpen: (o: DrawerObject) => void }) {
  const { data, provenance, isLoading, error } = useEnvelope("graph", intelligence.getGraph)
  const [selected, setSelected] = useState<string | null>(null)

  const neighbours = useMemo(() => {
    if (!data || !selected) return null
    const linked = new Set<string>([selected])
    for (const e of data.edges) {
      if (e.source === selected) linked.add(e.target)
      if (e.target === selected) linked.add(e.source)
    }
    return linked
  }, [data, selected])

  if (isLoading) return <PanelSkeleton rows={3} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  const labelOf = (id: string) => data.nodes.find((n) => n.id === id)?.label ?? id

  function selectNode(n: GraphNode) {
    setSelected(n.id)
    const connected = data!.edges
      .filter((e) => e.source === n.id || e.target === n.id)
      .map((e) => {
        const otherId = e.source === n.id ? e.target : e.source
        return `${EDGE_LABEL[e.kind]} → ${labelOf(otherId)}`
      })
    onOpen({
      id: n.id,
      kind: n.type === "theme" ? "Theme" : n.type === "item" ? "Item" : "Concept",
      title: n.label,
      subtitle: `${connected.length} connection${connected.length === 1 ? "" : "s"}`,
      chips: [{ label: `${Math.round(n.weight * 100)}% central`, tone: "accent" }],
      sections: [
        {
          heading: "How it connects",
          body:
            connected.length > 0
              ? connected.join(" · ")
              : "This node has no recorded connections yet — a candidate growth edge in your library.",
        },
      ],
      ask: `How does ${n.label} connect to the rest of what I've saved?`,
    })
  }

  return (
    <div>
      <PanelHeading
        title="Connections"
        hint="How your concepts, themes and items link together. Select a node to trace its links."
        provenance={provenance}
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        {/* graph */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)]">
          <svg viewBox="0 0 100 100" className="h-[440px] w-full" role="img" aria-label="Knowledge connection graph">
            {data.edges.map((e) => {
              const s = data.nodes.find((n) => n.id === e.source)!
              const t = data.nodes.find((n) => n.id === e.target)!
              const active = !selected || e.source === selected || e.target === selected
              return (
                <line
                  key={e.id}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={EDGE_COLOR[e.kind]}
                  strokeWidth={active ? 0.5 + e.strength * 0.8 : 0.3}
                  strokeOpacity={active ? 0.7 : 0.12}
                  strokeDasharray={e.kind === "contradicts" ? "1.5 1" : undefined}
                />
              )
            })}
            {data.nodes.map((n) => {
              const dim = neighbours ? !neighbours.has(n.id) : false
              const isSel = selected === n.id
              const r = 2 + n.weight * 3.5
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={() => selectNode(n)}
                  className="cursor-pointer"
                  opacity={dim ? 0.3 : 1}
                >
                  <circle
                    r={r}
                    fill={n.type === "theme" ? "var(--kn-ai)" : "var(--kn-well)"}
                    stroke={isSel ? "var(--kn-ai)" : "var(--kn-edge)"}
                    strokeWidth={isSel ? 1 : 0.4}
                  />
                  <text
                    y={r + 3.4}
                    textAnchor="middle"
                    className="fill-foreground"
                    style={{ fontSize: "2.9px", fontWeight: isSel ? 600 : 400 }}
                  >
                    {n.label}
                  </text>
                </g>
              )
            })}
          </svg>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="absolute right-3 top-3 rounded-full border border-[var(--kn-edge)] bg-[var(--kn-well)]/70 px-3 py-1 text-[12px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* legend + node list */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Link types</h3>
            <ul className="mt-3 space-y-2">
              {(Object.keys(EDGE_LABEL) as EdgeKind[]).map((k) => (
                <li key={k} className="flex items-center gap-2 text-[13px] text-foreground">
                  <span className="h-0.5 w-5 rounded" style={{ background: EDGE_COLOR[k] }} />
                  {EDGE_LABEL[k]}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nodes</h3>
            <ul className="mt-2 space-y-0.5">
              {[...data.nodes]
                .sort((a, b) => b.weight - a.weight)
                .map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => selectNode(n)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]",
                        selected === n.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-[var(--kn-well)]/40",
                      )}
                    >
                      <span className="truncate">{n.label}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{n.type}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

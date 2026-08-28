"use client"

/* ================================================================== *
 * CAMPO DE INTELIGÊNCIA (Fase 4 §1, item 3) — o elemento visual central
 * do novo Mission Control. Não é "um card contendo um grafo": é um
 * recorte real e pequeno (8-12 nós) do mesmo grafo real que alimenta
 * `/knowledge` (GET /api/v1/intelligence/map, lib/intelligence/map.ts),
 * renderizado com presença visual grande, direto na página — nunca
 * dados fictícios, nunca um número inventado.
 *
 * Graph UI real (Fase 3 §9): nó selecionado em foco total, vizinhos
 * diretos em opacidade plena, o resto recua para ~35% — nunca todos os
 * nós com o mesmo peso visual. Cada nó carrega badge de tipo real +
 * nome + 1 propriedade-chave real (score ou status) + contagem real de
 * relações (grau no próprio recorte). Clicar abre o Object Inspector
 * sem sair da página — a mesma trilha de investigação que
 * `/knowledge` já usa, nunca uma experiência paralela.
 * ================================================================== */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ReactFlow, Background, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Radar } from "lucide-react"
import type { MapNode } from "@/lib/intelligence/map"
import type { ObjectType } from "@/lib/ontology/object-resolver"
import { translateObjectType, translateRelation, translateStatus } from "@/lib/ontology/pt-br"
import { LoadingState } from "@/components/ontology/states"

const INSPECTABLE_TYPES = new Set<string>(["entity", "opportunity", "page", "decision", "agent_run", "observation"])

const TYPE_TONE: Record<string, string> = {
  opportunity: "border-chart-4/50 bg-chart-4/10 text-chart-4",
  entity: "border-chart-1/50 bg-chart-1/10 text-chart-1",
  page: "border-chart-2/50 bg-chart-2/10 text-chart-2",
  decision: "border-chart-5/50 bg-chart-5/10 text-chart-5",
  observation: "border-chart-5/50 bg-chart-5/10 text-chart-5",
}

interface FieldNodeData extends Record<string, unknown> {
  node: MapNode
  degree: number
  focusState: "selected" | "neighbor" | "dim" | "normal"
}

function FieldNode({ data }: NodeProps) {
  const { node, degree, focusState } = data as unknown as FieldNodeData
  const tone = TYPE_TONE[node.type] ?? "border-border bg-card text-foreground"
  const opacity = focusState === "dim" ? 0.35 : 1
  const scale = focusState === "selected" ? 1.06 : 1
  const ring = focusState === "selected" ? "ring-2 ring-primary" : focusState === "neighbor" ? "ring-1 ring-primary/40" : ""
  return (
    <button
      type="button"
      style={{ opacity, transform: `scale(${scale})`, minWidth: 168, maxWidth: 208 }}
      className={`rounded-md border px-2.5 py-2 text-left shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone} ${ring}`}
      aria-label={`${translateObjectType(node.type)}: ${node.label}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] opacity-75">{translateObjectType(node.type)}</span>
        {degree > 0 && <span className="shrink-0 font-mono text-[8px] tabular-nums opacity-60">{degree} rel.</span>}
      </div>
      <p className="mt-0.5 truncate text-[12px] font-medium leading-tight">{node.label}</p>
      {(node.score != null || node.status) && (
        <p className="mt-0.5 font-mono text-[9px] tabular-nums opacity-80">{node.score != null ? `pontuação ${Math.round(node.score)}` : translateStatus(node.status ?? null)}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </button>
  )
}

const nodeTypes = { field: FieldNode }

export function IntelligenceField({ onOpen }: { onOpen: (ref: { type: ObjectType; id: string }) => void }) {
  const [raw, setRaw] = useState<{ nodes: MapNode[]; edges: { from: string; to: string; relation: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const projectRes = await fetch("/api/projects/default")
      if (!projectRes.ok) throw new Error("Não foi possível resolver o projeto padrão.")
      const projectId = (await projectRes.json()).project.id
      const res = await fetch(`/api/v1/intelligence/map?mode=opportunities&projectId=${projectId}&limit=10`)
      if (!res.ok) throw new Error("Não foi possível carregar o campo de inteligência.")
      setRaw(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o campo de inteligência.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const neighborsOf = useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (!raw) return map
    for (const e of raw.edges) {
      if (!map.has(e.from)) map.set(e.from, new Set())
      if (!map.has(e.to)) map.set(e.to, new Set())
      map.get(e.from)!.add(e.to)
      map.get(e.to)!.add(e.from)
    }
    return map
  }, [raw])

  const { nodes, edges } = useMemo(() => {
    if (!raw) return { nodes: [] as Node[], edges: [] as Edge[] }
    const degree = new Map<string, number>()
    for (const e of raw.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
    }
    const rank = new Map<string, number>()
    for (const edge of raw.edges) {
      const depth = (rank.get(edge.from) ?? 0) + 1
      if (!rank.has(edge.to) || (rank.get(edge.to) ?? 0) < depth) rank.set(edge.to, depth)
    }
    const byDepth = new Map<number, number>()
    const activeNeighbors = selected ? (neighborsOf.get(selected) ?? new Set()) : null

    const flowNodes: Node[] = raw.nodes.map((n) => {
      const depth = rank.get(n.id) ?? 0
      const col = byDepth.get(depth) ?? 0
      byDepth.set(depth, col + 1)
      const focusState: FieldNodeData["focusState"] = !selected ? "normal" : n.id === selected ? "selected" : activeNeighbors?.has(n.id) ? "neighbor" : "dim"
      return { id: n.id, type: "field", position: { x: depth * 280, y: col * 100 }, data: { node: n, degree: degree.get(n.id) ?? 0, focusState } }
    })
    // Relation labels only render on the *selected* node's own edges —
    // with every real edge labeled at once (the pre-focus default) the
    // labels stack and cover the node text they sit over, exactly the
    // "isso é só um gráfico bonito" failure mode the brief calls out.
    // Unselected, the field shows structure only; selecting a node is
    // what turns a specific relation into a real, readable label
    // (Graph UI's own "foco real" requirement, Fase 3 §9).
    const flowEdges: Edge[] = raw.edges.map((e, i) => {
      const isOwnEdge = selected != null && (e.from === selected || e.to === selected)
      const inFocus = !selected || isOwnEdge
      return {
        id: `f${i}:${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        label: isOwnEdge ? translateRelation(e.relation) : undefined,
        labelStyle: { fontSize: 9, fill: "var(--color-primary)" },
        labelBgStyle: { fill: "var(--color-popover)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        style: { stroke: inFocus ? "var(--color-primary)" : "var(--color-border)", opacity: inFocus ? 0.9 : 0.25, strokeWidth: isOwnEdge ? 1.5 : 1 },
      }
    })
    return { nodes: flowNodes, edges: flowEdges }
  }, [raw, selected, neighborsOf])

  function onNodeClick(id: string) {
    const separator = id.indexOf(":")
    if (separator === -1) return
    const idType = id.slice(0, separator)
    const realId = id.slice(separator + 1)
    if (selected === id) {
      if (INSPECTABLE_TYPES.has(idType)) onOpen({ type: idType as ObjectType, id: realId })
      return
    }
    setSelected(id)
    if (INSPECTABLE_TYPES.has(idType)) onOpen({ type: idType as ObjectType, id: realId })
  }

  return (
    <section aria-label="Campo de inteligência">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Campo de inteligência</p>
        {raw && raw.nodes.length > 0 && <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{raw.nodes.length} objetos · {raw.edges.length} relações</p>}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-dashed border-destructive/30 px-4 py-8 text-center text-[13px] text-destructive">{error}</p>
      ) : !raw ? (
        <div className="mt-3 flex h-[360px] items-center justify-center rounded-xl border border-border bg-card">
          <LoadingState label="Carregando o campo de inteligência…" />
        </div>
      ) : raw.nodes.length === 0 ? (
        <div className="mt-3 flex h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 text-center">
          <Radar className="size-5 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Dados ainda não disponíveis — nenhuma oportunidade real conectada foi descoberta neste projeto ainda.</p>
        </div>
      ) : (
        <>
          <div className="relative mt-3 hidden h-[420px] overflow-hidden rounded-xl border border-border bg-card sm:block" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_e, n) => onNodeClick(n.id)}
              onPaneClick={() => setSelected(null)}
              fitView
              minZoom={0.4}
              maxZoom={1.4}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
            >
              <Background gap={22} className="opacity-40" />
            </ReactFlow>
          </div>

          {/* Progressive disclosure at narrow widths (§16): a dense,
           * fully equivalent list of the same real nodes/edges — never
           * a degraded or hidden experience below the graph's usable
           * width, and the same real interaction (select → inspect). */}
          <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-card sm:hidden" aria-label="Objetos do campo de inteligência">
            {raw.nodes.map((n) => (
              <li key={n.id}>
                <button onClick={() => onNodeClick(n.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40">
                  <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.08em] text-primary">{translateObjectType(n.type)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{n.label}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{n.score != null ? Math.round(n.score) : translateStatus(n.status ?? null)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

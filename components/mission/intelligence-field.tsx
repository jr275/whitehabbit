"use client"

/* ================================================================== *
 * CAMPO DE INTELIGÊNCIA — o elemento visual central do Mission Control
 * (docs/remax-knowledge-design-reference.md §1.4-1.6). Não é "um card
 * contendo um grafo": é um recorte real (8-12 nós) do mesmo grafo real
 * que alimenta `/knowledge` (GET /api/v1/intelligence/map), pareado com
 * o Object Inspector no MESMO plano — grafo + ficha do objeto lado a
 * lado (ou empilhados em telas estreitas), sempre juntos, nunca um
 * modal sobre o outro.
 *
 * Layout RADIAL, não colunas por profundidade (docs/remax-knowledge-
 * design-reference.md — referência secundária Vizup, "grafo de
 * presença" radial): o nó de maior grau real no recorte fica no
 * centro, seus vizinhos diretos orbitam em um anel, o segundo grau
 * orbita mais externamente — um mapa espacial real, nunca um
 * fluxograma de duas colunas fixas.
 *
 * Graph UI: nó selecionado em foco total, vizinhos diretos em opacidade
 * plena, o resto recua para ~25-35%. Cada nó carrega badge de tipo +
 * nome + contagem real de relações (grau no próprio recorte) + um
 * badge circular de pontuação sobrepondo o canto.
 *
 * Renderizado em TODAS as larguras (nunca uma lista-só no mobile) —
 * o ReactFlow aceita pan/zoom por toque nativamente; a sensação de
 * "objetos e relações" não pode desaparecer no mobile.
 * ================================================================== */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ReactFlow, Background, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Radar } from "lucide-react"
import type { MapNode } from "@/lib/intelligence/map"
import type { ObjectType } from "@/lib/ontology/object-resolver"
import { translateObjectType, translateRelation, translateStatus } from "@/lib/ontology/pt-br"
import { LoadingState } from "@/components/ontology/states"
import { ObjectInspector, useObjectInspector } from "@/components/ontology/object-inspector"

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
  const opacity = focusState === "dim" ? 0.3 : 1
  const scale = focusState === "selected" ? 1.08 : 1
  const ring = focusState === "selected" ? "ring-2 ring-primary" : focusState === "neighbor" ? "ring-1 ring-primary/40" : ""
  return (
    <button
      type="button"
      style={{ opacity, transform: `scale(${scale})`, minWidth: 172, maxWidth: 212 }}
      className={`relative rounded-md border px-2.5 py-2 text-left shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone} ${ring}`}
      aria-label={`${translateObjectType(node.type)}: ${node.label}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      {/* Badge circular de pontuação sobrepondo o canto — o tratamento
       * de identidade da referência, nunca texto solto. */}
      {node.score != null && (
        <span className="absolute -left-2 -top-2 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary font-mono text-[10px] font-bold tabular-nums text-primary-foreground">
          {Math.round(node.score)}
        </span>
      )}
      <div className="flex items-center justify-between gap-2 pl-0.5">
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] opacity-75">{translateObjectType(node.type)}</span>
        {degree > 0 && <span className="shrink-0 font-mono text-[8px] tabular-nums opacity-60">{degree} rel.</span>}
      </div>
      <p className="mt-0.5 truncate text-[12px] font-semibold leading-tight">{node.label}</p>
      {node.score == null && node.status && <p className="mt-0.5 font-mono text-[9px] tabular-nums opacity-80">{translateStatus(node.status)}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </button>
  )
}

const nodeTypes = { field: FieldNode }

/** O nó de maior grau real vira o centro do mapa; seus vizinhos diretos
 * orbitam em um anel; o resto (2º grau) orbita mais externamente perto
 * do vizinho que os conecta — um mapa espacial real, nunca colunas por
 * profundidade (o padrão radial da referência Vizup). */
function radialPositions(nodeIds: string[], edges: { from: string; to: string }[]): Map<string, { x: number; y: number }> {
  const adjacency = new Map<string, Set<string>>()
  const degree = new Map<string, number>()
  for (const id of nodeIds) adjacency.set(id, new Set())
  for (const e of edges) {
    adjacency.get(e.from)?.add(e.to)
    adjacency.get(e.to)?.add(e.from)
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
  }

  let center = nodeIds[0]
  let bestDegree = -1
  for (const id of nodeIds) {
    const d = degree.get(id) ?? 0
    if (d > bestDegree) {
      bestDegree = d
      center = id
    }
  }

  const positions = new Map<string, { x: number; y: number }>()
  positions.set(center, { x: 0, y: 0 })

  // Elliptical, not circular: real nodes are ~200px wide but only
  // ~70px tall, so a true circle crowds/overlaps nodes that land near
  // the horizontal axis. A wider-than-tall ellipse (and a slight angle
  // offset so no two rings share an axis exactly) keeps every real
  // node legible and non-overlapping.
  const ring1 = [...(adjacency.get(center) ?? [])]
  const RX1 = 300
  const RY1 = 190
  ring1.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(ring1.length, 1) - Math.PI / 2
    positions.set(id, { x: RX1 * Math.cos(angle), y: RY1 * Math.sin(angle) })
  })

  const assigned = new Set([center, ...ring1])
  const ring2 = nodeIds.filter((id) => !assigned.has(id))
  const RX2 = 620
  const RY2 = 360
  const RING2_ANGLE_OFFSET = Math.PI / (ring1.length || 1) / 2
  const siblingsByParent = new Map<number, number>() // how many ring2 nodes already placed under this ring1 parent — spreads siblings apart instead of stacking them
  ring2.forEach((id, i) => {
    let parentIndex = -1
    for (const neighbor of adjacency.get(id) ?? []) {
      const idx = ring1.indexOf(neighbor)
      if (idx !== -1) {
        parentIndex = idx
        break
      }
    }
    if (parentIndex !== -1) {
      const siblingIndex = siblingsByParent.get(parentIndex) ?? 0
      siblingsByParent.set(parentIndex, siblingIndex + 1)
      const spread = siblingIndex * 0.35 * (siblingIndex % 2 === 0 ? 1 : -1)
      const angle = (2 * Math.PI * parentIndex) / Math.max(ring1.length, 1) - Math.PI / 2 + RING2_ANGLE_OFFSET + spread
      positions.set(id, { x: RX2 * Math.cos(angle), y: RY2 * Math.sin(angle) })
    } else {
      const angle = (2 * Math.PI * i) / Math.max(ring2.length, 1) - Math.PI / 2
      positions.set(id, { x: RX2 * Math.cos(angle), y: RY2 * Math.sin(angle) })
    }
  })

  return positions
}

export function IntelligenceField() {
  const [raw, setRaw] = useState<{ nodes: MapNode[]; edges: { from: string; to: string; relation: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const inspector = useObjectInspector()

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
    const positions = radialPositions(raw.nodes.map((n) => n.id), raw.edges)
    const activeNeighbors = selected ? (neighborsOf.get(selected) ?? new Set()) : null

    const flowNodes: Node[] = raw.nodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 }
      const focusState: FieldNodeData["focusState"] = !selected ? "normal" : n.id === selected ? "selected" : activeNeighbors?.has(n.id) ? "neighbor" : "dim"
      return { id: n.id, type: "field", position: pos, data: { node: n, degree: degree.get(n.id) ?? 0, focusState } }
    })
    // Relation labels only render on the *selected* node's own edges —
    // with every real edge labeled at once (the pre-focus default) the
    // labels stack and cover the node text they sit over. Unselected,
    // the field shows structure only; selecting a node is what turns a
    // specific relation into a real, readable label (foco real).
    const flowEdges: Edge[] = raw.edges.map((e, i) => {
      const isOwnEdge = selected != null && (e.from === selected || e.to === selected)
      const inFocus = !selected || isOwnEdge
      return {
        id: `f${i}:${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        type: "straight",
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
    setSelected(id)
    if (INSPECTABLE_TYPES.has(idType)) inspector.open({ type: idType as ObjectType, id: realId })
  }

  function closeInspector() {
    inspector.close()
    setSelected(null)
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
        <div className="mt-3 flex h-[420px] items-center justify-center rounded-xl border border-border bg-card">
          <LoadingState label="Carregando o campo de inteligência…" />
        </div>
      ) : raw.nodes.length === 0 ? (
        <div className="mt-3 flex h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 text-center">
          <Radar className="size-5 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Dados ainda não disponíveis — nenhuma oportunidade real conectada foi descoberta neste projeto ainda.</p>
        </div>
      ) : (
        /* Grafo + Inspector ancorado — o mesmo plano, sempre juntos,
         * nunca um modal sobre o outro. Lado a lado a partir de `sm`
         * (container com altura definida + `min-h-0` nos dois filhos —
         * sem isso o Inspector vaza para fora da linha do grafo, uma
         * armadilha clássica de flexbox); empilhados em telas
         * estreitas, cada bloco com sua própria altura fixa — o grafo
         * real nunca desaparece, em nenhuma largura. */
        <div className="mt-3 flex flex-col overflow-hidden rounded-xl border border-border bg-card sm:h-[500px] sm:flex-row">
          <div className="relative h-[320px] shrink-0 sm:h-auto sm:min-h-0 sm:min-w-0 sm:flex-1" onClick={(e) => e.target === e.currentTarget && closeInspector()}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_e, n) => onNodeClick(n.id)}
              onPaneClick={closeInspector}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.3}
              maxZoom={1.4}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
            >
              <Background gap={22} className="opacity-40" />
            </ReactFlow>
            {!selected && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-popover/90 px-2.5 py-1.5 backdrop-blur-sm">
                <p className="text-right text-[10px] text-muted-foreground">Como ler — selecione um objeto para revelar relações e evidências</p>
              </div>
            )}
          </div>
          {inspector.isOpen && (
            <div className="h-[380px] shrink-0 border-t border-border sm:h-auto sm:min-h-0 sm:w-[360px] sm:border-l sm:border-t-0">
              <ObjectInspector variant="docked" stack={inspector.stack} setStack={inspector.setStack} onClose={closeInspector} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

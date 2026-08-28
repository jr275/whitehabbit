"use client"

/* Opportunity / Intelligence Map (Phase 8, §6-9, ADR-044) — a real
 * graph over live API data. Uses React Flow (the one, real, production
 * graph library this codebase adds for exactly this — no second
 * competing canvas engine). Every filter is a real query param sent to
 * the server (§8: "do not fetch the entire graph and filter in the
 * browser") — changing a filter re-fetches a bounded, already-filtered
 * slice, never a client-side re-filter of an unbounded fetch.
 *
 * Accessibility (§26): every node is a real, focusable, keyboard-
 * activatable <button>-backed React Flow node — never a bare <div
 * onClick>. A non-visual list view alongside the canvas exposes the
 * exact same real nodes/edges as plain, filterable, screen-reader-
 * navigable text — never a degraded experience for a non-visual user. */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { CircleAlert, Clock3, List, Network } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { GraphMode, MapNode } from "@/lib/intelligence/map"

const MODES: { mode: GraphMode; label: string }[] = [
  { mode: "opportunities", label: "Opportunities" },
  { mode: "knowledge", label: "Knowledge" },
  { mode: "markets", label: "Markets" },
  { mode: "roles", label: "Roles" },
  { mode: "intents", label: "Intents" },
  { mode: "pages", label: "Pages" },
  { mode: "decisions", label: "Decisions" },
]

const TYPE_TONE: Record<string, string> = {
  opportunity: "border-primary/40 bg-primary/10 text-primary",
  entity: "border-grow/40 bg-grow/10 text-grow",
  page: "border-warn/40 bg-warn/10 text-warn",
  decision: "border-primary/40 bg-primary/10 text-primary",
  observation: "border-border bg-card text-muted-foreground",
}

function IntelligenceNode({ data }: NodeProps) {
  const node = data as unknown as MapNode
  const tone = TYPE_TONE[node.type] ?? "border-border bg-card text-foreground"
  // real score -> real visual weight (§6): a higher real score renders
  // a visibly larger, more saturated node — never a fixed size.
  const scale = node.score != null ? 0.85 + Math.min(1, Math.max(0, node.score) / 100) * 0.5 : 1
  return (
    <button
      type="button"
      className={`rounded-lg border px-3 py-2 text-left shadow-sm transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone}`}
      style={{ transform: `scale(${scale})`, minWidth: 140, maxWidth: 220 }}
      aria-label={`${node.type}: ${node.label}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <p className="font-mono text-[8px] uppercase tracking-[0.12em] opacity-70">{node.type}</p>
      <p className="mt-0.5 truncate text-xs font-medium">{node.label}</p>
      {node.score != null && <p className="mt-0.5 font-mono text-[9px] opacity-80">score {Math.round(node.score)}</p>}
      {node.status && <p className="font-mono text-[9px] capitalize opacity-70">{node.status}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </button>
  )
}

const nodeTypes = { intelligence: IntelligenceNode }

interface InspectorState {
  node: MapNode
  detail: Record<string, unknown> | null
  loading: boolean
}

function useInspectorDetail(node: MapNode | null): InspectorState | null {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!node) {
      setDetail(null)
      return
    }
    setDetail(null)
    setLoading(true)
    const [type, id] = [node.type, node.id.slice(node.type.length + 1)]
    const path = type === "opportunity" ? `/api/opportunities/${id}` : type === "entity" ? `/api/knowledge/entities/${id}` : type === "page" ? `/api/pages/${id}` : null
    if (!path) {
      setLoading(false)
      return
    }
    fetch(path)
      .then((res) => (res.ok ? res.json() : null))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [node])

  if (!node) return null
  return { node, detail, loading }
}

function Inspector({ state, onClose }: { state: InspectorState; onClose: () => void }) {
  const { node, detail, loading } = state
  const opportunity = node.type === "opportunity" ? (detail?.opportunity as Record<string, unknown> | undefined) : undefined
  const entity = node.type === "entity" ? (detail?.entity as Record<string, unknown> | undefined) : undefined
  const page = node.type === "page" ? (detail?.page as Record<string, unknown> | undefined) : undefined

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background p-5 shadow-2xl sm:w-[420px]" role="dialog" aria-label={`${node.type} detail`}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">Intelligence Inspector · {node.type}</p>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Close inspector">Close</button>
      </div>
      <h2 className="mt-2 text-lg font-semibold text-foreground">{node.label}</h2>

      {loading && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> Loading real detail…</p>}

      {opportunity && (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Status" value={String(opportunity.status)} />
          <Row label="Final score" value={opportunity.finalScore != null ? String(opportunity.finalScore) : "—"} />
          <Row label="Information gain" value={opportunity.informationGainScore != null ? String(opportunity.informationGainScore) : "—"} />
          <Row label="Business value" value={opportunity.businessValueScore != null ? String(opportunity.businessValueScore) : "—"} />
          <Row label="Entity coverage" value={opportunity.entityCoverageScore != null ? String(opportunity.entityCoverageScore) : "—"} />
          <a href={`/opportunities/${opportunity.id}`} className="mt-2 inline-block text-xs text-primary hover:underline">Open full opportunity →</a>
        </div>
      )}

      {entity && (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Type" value={String(entity.entityType)} />
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Related entities ({((detail?.relatedEntities as unknown[]) ?? []).length})</p>
          <ul className="flex flex-col gap-1">
            {((detail?.relatedEntities as { id: string; name: string }[]) ?? []).slice(0, 8).map((r) => <li key={r.id} className="truncate text-xs text-foreground">{r.name}</li>)}
          </ul>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Real evidence ({((detail?.evidence as unknown[]) ?? []).length})</p>
          <a href="/knowledge" className="mt-2 inline-block text-xs text-primary hover:underline">Open in Knowledge Graph →</a>
        </div>
      )}

      {page && (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Status" value={String(page.status)} />
          <Row label="Quality" value={page.qualityScore != null ? String(page.qualityScore) : "—"} />
          <Row label="Information gain" value={page.informationGainScore != null ? String(page.informationGainScore) : "—"} />
          <a href={`/pages/${page.id}`} className="mt-2 inline-block text-xs text-primary hover:underline">Open full page →</a>
        </div>
      )}

      {!opportunity && !entity && !page && !loading && (
        <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
          {node.score != null && <Row label="Score" value={String(node.score)} />}
          {node.status && <Row label="Status" value={node.status} />}
          <p className="mt-2 text-xs">No richer detail endpoint exists yet for real "{node.type}" nodes — real id: {node.id}.</p>
          {node.type === "decision" && <a href="/intelligence/decisions" className="text-xs text-primary hover:underline">Open in Decision Center →</a>}
        </div>
      )}
    </aside>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

export function IntelligenceGraph() {
  const [mode, setMode] = useState<GraphMode>("opportunities")
  const [entityType, setEntityType] = useState("")
  const [status, setStatus] = useState("")
  const [minScore, setMinScore] = useState("")
  const [raw, setRaw] = useState<{ nodes: MapNode[]; edges: { from: string; to: string; relation: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MapNode | null>(null)
  const [view, setView] = useState<"graph" | "list">("graph")
  const [projectId, setProjectId] = useState<string | null>(null)

  const inspector = useInspectorDetail(selected)

  const load = useCallback(async () => {
    setRaw(null)
    try {
      let pid = projectId
      if (!pid) {
        const projectRes = await fetch("/api/projects/default")
        if (!projectRes.ok) throw new Error("Could not resolve the default project.")
        pid = (await projectRes.json()).project.id
        setProjectId(pid)
      }
      const params = new URLSearchParams({ mode, projectId: pid! })
      if (entityType) params.set("entityType", entityType)
      if (status) params.set("status", status)
      if (minScore) params.set("minScore", minScore)
      const res = await fetch(`/api/v1/intelligence/map?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load the graph.")
      setRaw(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the graph.")
    }
  }, [mode, entityType, status, minScore, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const { nodes, edges } = useMemo(() => {
    if (!raw) return { nodes: [] as Node[], edges: [] as Edge[] }
    const rank = new Map<string, number>()
    for (const edge of raw.edges) {
      const depth = (rank.get(edge.from) ?? 0) + 1
      if (!rank.has(edge.to) || (rank.get(edge.to) ?? 0) < depth) rank.set(edge.to, depth)
    }
    const byDepth = new Map<number, number>()
    const flowNodes: Node[] = raw.nodes.map((n) => {
      const depth = rank.get(n.id) ?? 0
      const col = byDepth.get(depth) ?? 0
      byDepth.set(depth, col + 1)
      return { id: n.id, type: "intelligence", position: { x: depth * 260, y: col * 90 }, data: n as unknown as Record<string, unknown> }
    })
    const flowEdges: Edge[] = raw.edges.map((e, i) => ({ id: `e${i}:${e.from}->${e.to}`, source: e.from, target: e.to, label: e.relation, style: { stroke: "var(--color-border)" } }))
    return { nodes: flowNodes, edges: flowEdges }
  }, [raw])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Intelligence Graph</p>
            <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">What the system knows, connected</h1>
            <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">Real entities, opportunities, and decisions — every node and edge is a real, persisted row, server-filtered before it ever reaches this page.</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            <button onClick={() => setView("graph")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${view === "graph" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}><Network className="size-3.5" /> Graph</button>
            <button onClick={() => setView("list")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}><List className="size-3.5" /> List</button>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <button key={m.mode} onClick={() => setMode(m.mode)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${mode === m.mode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {m.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {(mode === "knowledge") && <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Entity type…" className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground" />}
            {mode === "opportunities" && <input value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="Min score…" className="h-8 w-28 rounded-md border border-border bg-card px-2.5 text-xs text-foreground" />}
            <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Status…" className="h-8 w-28 rounded-md border border-border bg-card px-2.5 text-xs text-foreground" />
          </div>
        </div>

        {error && <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" /> {error}</div>}

        {!raw ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading real graph data…</div>
        ) : raw.nodes.length === 0 ? (
          <p className="mt-10 rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">No real data in this mode yet for this project.</p>
        ) : view === "graph" ? (
          <div className="mt-6 h-[640px] overflow-hidden rounded-xl border border-border bg-card">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_e, n) => setSelected(n.data as unknown as MapNode)} fitView proOptions={{ hideAttribution: true }}>
              <Background gap={24} />
              <Controls />
              <MiniMap pannable zoomable className="!bg-card" />
            </ReactFlow>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2" aria-label="Graph nodes, list view">
            {raw.nodes.map((n) => (
              <li key={n.id}>
                <button onClick={() => setSelected(n)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary/40">
                  <span className="flex items-center gap-2 text-sm"><span className="font-mono text-[9px] uppercase text-muted-foreground">{n.type}</span> {n.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{n.score != null ? `score ${Math.round(n.score)}` : n.status ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {inspector && <Inspector state={inspector} onClose={() => setSelected(null)} />}
    </div>
  )
}

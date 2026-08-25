"use client"

import { Activity, ArrowUpRight, CheckCircle2, Database, KeyRound, Loader2, LockKeyhole, PlugZap, Search, ShieldCheck, Unplug } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { TopNav } from "@/components/studio/top-nav"
import { TOOL_CATALOG } from "@/lib/workforce/catalog"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

const CATEGORY: Record<string, string> = { web: "Research", llm: "Intelligence", crm: "Revenue", analytics: "Analytics", email: "Communication" }

export function IntegrationsWorkspace({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const state = useWorkforce()
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState("All")
  useEffect(() => { void workforceStore.hydrate() }, [])

  const tools = useMemo(() => TOOL_CATALOG.map((catalogTool) => {
    const assignments = state.workers.filter((worker) => worker.tools.some((tool) => tool.id === catalogTool.id && tool.enabled))
    const connected = assignments.some((worker) => worker.tools.some((tool) => tool.id === catalogTool.id && tool.connected))
    return { ...catalogTool, assignments, connected, category: CATEGORY[catalogTool.provider.toLowerCase()] ?? "Infrastructure" }
  }), [state.workers])
  const categories = ["All", ...Array.from(new Set(tools.map((tool) => tool.category)))]
  const filtered = tools.filter((tool) => (scope === "All" || tool.category === scope) && `${tool.name} ${tool.provider} ${tool.category}`.toLowerCase().includes(query.toLowerCase()))
  const connectedCount = tools.filter((tool) => tool.connected).length
  const assignedCount = tools.filter((tool) => tool.assignments.length).length

  return <div className="min-h-dvh bg-background text-foreground"><TopNav runtimeMode={runtimeMode} /><main id="main-content" className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8">
    <header className="grid gap-8 border-b border-border pb-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-end"><div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary"><PlugZap className="size-3.5" />Enterprise connectors</div><h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Integration infrastructure</h1><p className="mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">Inspect the capability catalog, Worker assignments, permissions, and persisted connection evidence. Account selection, OAuth scopes, health checks, and connect/disconnect mutations require a backend connector and are not exposed here.</p></div><div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border"><Metric label="Catalog" value={String(tools.length)} icon={Database} /><Metric label="Assigned" value={String(assignedCount)} icon={Activity} /><Metric label="Persisted connected" value={String(connectedCount)} icon={CheckCircle2} /></div></header>

    {!state.hydrated ? <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading runtime state</div> : <>
      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative max-w-lg flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><label htmlFor="integration-search" className="sr-only">Search integrations</label><input id="integration-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connectors, providers, capabilities…" className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary" /></div><div className="flex flex-wrap gap-2">{categories.map((category) => <button key={category} onClick={() => setScope(category)} className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${scope === category ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{category}</button>)}</div></section>
      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Integration catalog">{filtered.map((tool) => <article key={tool.id} className="flex min-h-64 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30"><div className="flex items-start justify-between gap-4"><div className="flex size-11 items-center justify-center rounded-xl border border-border bg-secondary"><PlugZap className="size-5 text-primary" /></div><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${tool.connected ? "border-grow/30 bg-grow/10 text-grow" : "border-border bg-secondary text-muted-foreground"}`}>{tool.connected ? <CheckCircle2 className="size-3" /> : <Unplug className="size-3" />}{tool.connected ? "Connected" : "Not connected"}</span></div><p className="mt-5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{tool.category} · {tool.provider}</p><h2 className="mt-2 text-lg font-semibold">{tool.name}</h2><div className="mt-4 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[10px] text-muted-foreground"><ShieldCheck className="size-3" />{tool.risk} risk</span><span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[10px] text-muted-foreground"><KeyRound className="size-3" />{tool.permission}</span></div><div className="mt-auto border-t border-border pt-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">Assigned workforce</p><p className="mt-1 truncate text-xs text-foreground">{tool.assignments.length ? tool.assignments.map((worker) => worker.identity.name).join(" · ") : "No Workers require this tool"}</p><div className="mt-4 flex items-center justify-between"><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><LockKeyhole className="size-3" />Server-managed credentials</span><a href="/studio" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Assign in Studio <ArrowUpRight className="size-3" /></a></div></div></article>)}</section>
      {!filtered.length && <div className="mt-5 rounded-2xl border border-dashed border-border py-20 text-center"><p className="text-sm font-medium">No connectors match this view</p><p className="mt-1 text-xs text-muted-foreground">Try another search or category.</p></div>}
    </>}
  </main></div>
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Database }) { return <div className="bg-card p-4"><Icon className="size-4 text-primary" /><p className="mt-4 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p></div> }

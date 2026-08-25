"use client"

import { ArrowRight, Play } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ActiveWork } from "@/components/outputs/active-work"
import { EvolveSection } from "@/components/outputs/evolve-section"
import { OutputsHeader } from "@/components/outputs/header-metrics"
import { OutputDrawer, type DrawerFilter } from "@/components/outputs/output-drawer"
import { OutputTable } from "@/components/outputs/output-table"
import { ActivityTimeline } from "@/components/outputs/timeline"
import { WorkerOutputCard } from "@/components/outputs/worker-card"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"
import { businessResults, formatBusinessValue } from "@/lib/workforce/business-results"
import { OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { headerMetrics, todaysTimeline } from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

type View = "recent" | "results" | "workers" | "outcomes"
const VIEWS: { id: View; label: string }[] = [
  { id: "recent", label: "Overview" }, { id: "results", label: "Run ledger" }, { id: "workers", label: "By Worker" }, { id: "outcomes", label: "Outcomes" },
]

export function OutputsHub() {
  const { hydrated, workers, tasks, executions, outputs, metrics, events } = useWorkforce()
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null)
  const [view, setView] = useState<View>("recent")
  useEffect(() => { workforceStore.hydrate() }, [])
  if (!hydrated) return <div className="flex min-h-[60dvh] items-center justify-center font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Loading business results…</div>

  const openType = (workerId: string, type: string) => setDrawer({ kind: "type", workerId, type, title: OUTPUT_TYPE_META[type]?.plural ?? type })
  const openExecution = (executionId: string) => setDrawer({ kind: "execution", executionId })
  const metricsHeader = headerMetrics(tasks, executions, outputs)
  const timeline = todaysTimeline(workers, executions, tasks, outputs)
  const completed = executions.filter((item) => item.status === "completed")
  const quality = outputs.length ? Math.round(outputs.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / outputs.length) : 0
  const resultCards = businessResults(workers, metrics, executions, outputs)

  return <main id="main-content" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8"><div className="flex flex-col gap-7">
    <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-2 flex items-center gap-2"><span className="size-1.5 rounded-full bg-grow" /><span className="font-mono text-[10px] uppercase tracking-[0.22em] text-grow">Persisted execution ledger</span></div><h1 className="text-balance text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">Runs &amp; Outputs</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Inspect execution state, chronological evidence, quality, cost coverage, and every persisted Worker output.</p></div><div className="grid grid-cols-3 gap-2"><Metric value={String(executions.length)} label="Runs" /><Metric value={`${quality}%`} label="Quality" /><Metric value={String(outputs.length)} label="Outputs" /></div></header>
    <nav aria-label="Run and output views" className="flex overflow-x-auto border-b border-border">{VIEWS.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${view === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</nav>
    {view === "recent" && <div className="flex flex-col gap-10">
      <section><SectionHeading eyebrow="Business impact" title="Outcomes your workforce is accountable for" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{resultCards.slice(0, 8).map((result) => <article key={`${result.workerId}:${result.key}`} className="flex min-h-44 flex-col justify-between rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{result.workerName}</p><h3 className="mt-1 text-sm font-semibold text-foreground">{result.label}</h3></div><ProvenanceBadge provenance={result.provenance} /></div><div><p className="font-mono text-3xl font-semibold tracking-tight text-foreground">{formatBusinessValue(result.value, result.unit)}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{result.value == null ? result.activation : `${result.source} · ${new Date(result.recordedAt ?? 0).toLocaleDateString()}`}</p></div></article>)}</div>{resultCards.length === 0 && <EmptyState />}</section>
      <section><SectionHeading eyebrow="Execution summary" title="Operational performance" /><OutputsHeader metrics={metricsHeader} /></section>
      {outputs.length ? <><section><SectionHeading eyebrow="Workforce execution" title="Work in motion" /><ActiveWork workers={workers} executions={executions} tasks={tasks} events={events} /></section><section><SectionHeading eyebrow="Evidence" title="Today’s attributable activity" /><ActivityTimeline entries={timeline} onOpen={openExecution} /></section></> : workers.length > 0 ? null : <EmptyState />}
    </div>}
    {view === "workers" && <section><SectionHeading eyebrow={`${workers.length} deployed`} title="Workers and their results" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{workers.map((worker) => <WorkerOutputCard key={worker.id} worker={worker} tasks={tasks} outputs={outputs} running={workforceStore.isRunning(worker.id)} onOpenType={openType} />)}{workers.length === 0 && <EmptyState />}</div></section>}
    {view === "results" && <section><SectionHeading eyebrow="Execution ledger" title="Inspect every result" /><OutputTable workers={workers} tasks={tasks} executions={executions} outputs={outputs} onOpenExecution={openExecution} /></section>}
    {view === "outcomes" && <section><SectionHeading eyebrow="Evidence-backed improvement" title="Outcomes and evolution readiness" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{resultCards.slice(0, 8).map((result) => <article key={`${result.workerId}:${result.key}`} className="flex min-h-40 flex-col justify-between rounded-xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{result.workerName}</p><h3 className="mt-1 text-sm font-semibold text-foreground">{result.label}</h3></div><ProvenanceBadge provenance={result.provenance} /></div><div><p className="font-mono text-2xl font-semibold tracking-tight text-foreground">{formatBusinessValue(result.value, result.unit)}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{result.value == null ? result.activation : `${result.source} · ${new Date(result.recordedAt ?? 0).toLocaleDateString()}`}</p></div></article>)}</div>{resultCards.length === 0 && <EmptyState />}<div className="mt-8 border-t border-border pt-8"><EvolveSection workers={workers} metrics={metrics} tasks={tasks} /></div></section>}
  </div>{drawer && <OutputDrawer filter={drawer} workers={workers} tasks={tasks} executions={executions} outputs={outputs} metrics={metrics} events={events} onClose={() => setDrawer(null)} />}</main>
}

function Metric({ value, label }: { value: string; label: string }) { return <div className="min-w-24 rounded-xl border border-border bg-card px-4 py-3"><div className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div></div> }
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="mb-4"><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{title}</h2></div> }
function EmptyState() { return <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center"><Play className="size-7 text-primary" /><h2 className="mt-5 text-xl font-semibold text-foreground">Your first result starts in Studio</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Assemble a worker around a business objective, verify its configuration, and run it. Evidence-backed outputs will appear here.</p><Link href="/studio" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground">Open Studio<ArrowRight className="size-3.5" /></Link></div> }

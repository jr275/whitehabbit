"use client"

import { ArrowRight, Bookmark, BriefcaseBusiness, Download, ExternalLink, Play, Share2, Sparkles } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ActiveWork } from "@/components/outputs/active-work"
import { EvolveSection } from "@/components/outputs/evolve-section"
import { OutputsHeader } from "@/components/outputs/header-metrics"
import { OutputDrawer, type DrawerFilter } from "@/components/outputs/output-drawer"
import { OutputTable } from "@/components/outputs/output-table"
import { ActivityTimeline } from "@/components/outputs/timeline"
import { WorkerOutputCard } from "@/components/outputs/worker-card"
import { OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { headerMetrics, todaysTimeline } from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

type View = "recent" | "workers" | "results" | "saved" | "actions"
const VIEWS: { id: View; label: string }[] = [
  { id: "recent", label: "Recent Outputs" }, { id: "workers", label: "Workers" }, { id: "results", label: "Results" }, { id: "saved", label: "Saved" }, { id: "actions", label: "Actions" },
]

export function OutputsHub() {
  const { hydrated, workers, tasks, executions, outputs, metrics, events } = useWorkforce()
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null)
  const [view, setView] = useState<View>("recent")
  const [feedback, setFeedback] = useState<string | null>(null)
  useEffect(() => { workforceStore.hydrate() }, [])
  if (!hydrated) return <div className="flex min-h-[60dvh] items-center justify-center font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Loading business results…</div>

  const openType = (workerId: string, type: string) => setDrawer({ kind: "type", workerId, type, title: OUTPUT_TYPE_META[type]?.plural ?? type })
  const openExecution = (executionId: string) => setDrawer({ kind: "execution", executionId })
  const metricsHeader = headerMetrics(tasks, executions, outputs)
  const timeline = todaysTimeline(workers, executions, tasks, outputs)
  const completed = executions.filter((item) => item.status === "completed")
  const quality = outputs.length ? Math.round(outputs.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / outputs.length) : 0
  const action = (label: string) => setFeedback(`${label} is ready for integration. No external system was changed.`)

  return <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 sm:py-10"><div className="flex flex-col gap-8">
    <header className="flex flex-col gap-6 border-b border-border pb-8 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-4 flex items-center gap-2"><span className="size-2 rounded-full bg-grow" /><span className="font-mono text-[10px] uppercase tracking-[0.26em] text-grow">Business result ledger</span></div><h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">Outputs that move work forward.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Review completed work, inspect evidence, and turn trusted worker results into the next business action.</p></div><div className="grid grid-cols-3 gap-3"><Metric value={String(outputs.length)} label="Results" /><Metric value={`${quality}%`} label="Avg. quality" /><Metric value={String(completed.length)} label="Completed" /></div></header>
    <nav aria-label="Output views" className="flex overflow-x-auto border-b border-border">{VIEWS.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${view === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</nav>
    {feedback && <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-foreground"><span>{feedback}</span><button onClick={() => setFeedback(null)} className="text-muted-foreground hover:text-foreground">Dismiss</button></div>}
    {view === "recent" && <div className="flex flex-col gap-10"><OutputsHeader metrics={metricsHeader} />{outputs.length ? <><section><SectionHeading eyebrow="Live workforce" title="Work in motion" /><ActiveWork workers={workers} executions={executions} tasks={tasks} events={events} /></section><section><SectionHeading eyebrow="Evidence stream" title="Today’s activity" /><ActivityTimeline entries={timeline} onOpen={openExecution} /></section></> : <EmptyState />}</div>}
    {view === "workers" && <section><SectionHeading eyebrow={`${workers.length} deployed`} title="Workers and their results" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{workers.map((worker) => <WorkerOutputCard key={worker.id} worker={worker} tasks={tasks} outputs={outputs} running={workforceStore.isRunning(worker.id)} onOpenType={openType} />)}{workers.length === 0 && <EmptyState />}</div></section>}
    {view === "results" && <section><SectionHeading eyebrow="Execution ledger" title="Inspect every result" /><OutputTable workers={workers} tasks={tasks} executions={executions} outputs={outputs} onOpenExecution={openExecution} /></section>}
    {view === "saved" && <section><SectionHeading eyebrow="Reference shelf" title="Saved results" /><div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center"><Bookmark className="size-7 text-muted-foreground" /><h2 className="mt-5 text-xl font-semibold text-foreground">Nothing saved yet</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Open a result to inspect its evidence. Saving will become available when a persistence contract is connected.</p><button onClick={() => setView("results")} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary">Browse results<ArrowRight className="size-3.5" /></button></div></section>}
    {view === "actions" && <section><SectionHeading eyebrow="Activation layer" title="Put trusted outputs to work" /><div className="grid gap-4 md:grid-cols-2">{[[Download, "Export results", "Prepare a structured export for reporting or analysis."], [Share2, "Share with a team", "Route a verified result to the people who need it."], [Sparkles, "Create campaign", "Turn research and recommendations into a campaign brief."], [BriefcaseBusiness, "Add to CRM", "Attach qualified evidence to the right account or lead."]].map(([Icon, title, description]) => <button key={String(title)} onClick={() => action(String(title))} className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/40"><span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-primary"><Icon className="size-4" /></span><span className="flex-1"><span className="block text-sm font-semibold text-foreground">{String(title)}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{String(description)}</span></span><ExternalLink className="size-4 text-muted-foreground" /></button>)}</div><div className="mt-10 border-t border-border pt-10"><EvolveSection workers={workers} metrics={metrics} tasks={tasks} /></div></section>}
  </div>{drawer && <OutputDrawer filter={drawer} workers={workers} tasks={tasks} executions={executions} outputs={outputs} events={events} onClose={() => setDrawer(null)} />}</main>
}

function Metric({ value, label }: { value: string; label: string }) { return <div className="min-w-24 rounded-xl border border-border bg-card px-4 py-3"><div className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div></div> }
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="mb-4"><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{title}</h2></div> }
function EmptyState() { return <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center"><Play className="size-7 text-primary" /><h2 className="mt-5 text-xl font-semibold text-foreground">Your first result starts in Studio</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Assemble a worker around a business objective, verify its configuration, and run it. Evidence-backed outputs will appear here.</p><Link href="/studio" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground">Open Studio<ArrowRight className="size-3.5" /></Link></div> }

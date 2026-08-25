"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Bot, BrainCircuit, CheckCircle2, ChevronRight, CircleDot, Clock3, Database, Eye, FileText, Gauge, Layers3, Megaphone, Radio, Search, Sparkles, Target, X } from "lucide-react"
import { marketingCreatives, marketingOpportunities, marketingSignals, executiveInsights, impactRows, type MarketingCreative, type MarketingOpportunity } from "@/lib/insights/marketing-command-data"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"
import type { WorkerExecution } from "@/lib/workforce/model"

const STATUS_STYLE: Record<string, string> = {
  detected: "border-border bg-secondary text-muted-foreground",
  investigating: "border-primary/25 bg-primary/10 text-primary",
  validated: "border-grow/25 bg-grow/10 text-grow",
  executing: "border-warn/25 bg-warn/10 text-warn",
  completed: "border-grow/25 bg-grow/10 text-grow",
  running: "border-primary/25 bg-primary/10 text-primary",
  queued: "border-border bg-secondary text-muted-foreground",
  failed: "border-destructive/25 bg-destructive/10 text-destructive",
  blocked: "border-warn/25 bg-warn/10 text-warn",
  pending_approval: "border-warn/25 bg-warn/10 text-warn",
  cancelled: "border-border bg-secondary text-muted-foreground",
}

function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${STATUS_STYLE[value] ?? STATUS_STYLE.detected}`}>{value.replaceAll("_", " ")}</span>
}

function DemoTag() {
  return <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-primary">Demo intelligence</span>
}

function SectionTitle({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: React.ReactNode }) {
  return <div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">{eyebrow}</p><h2 className="mt-1 text-balance text-xl font-semibold tracking-tight text-foreground">{title}</h2></div>{aside}</div>
}

function MiniSignalChart() {
  const points = [34, 31, 35, 28, 29, 22, 24, 18, 20, 14, 16, 10]
  return <div className="flex h-12 items-end gap-1" aria-label="Signal momentum rising over twelve observations">{points.map((value, index) => <span key={index} className="w-2 rounded-sm bg-primary/20" style={{ height: `${54 - value}px`, opacity: 0.35 + index * 0.05 }} />)}</div>
}

function CreativePreview({ creative }: { creative: MarketingCreative }) {
  const accent = creative.palette === "cyan" ? "bg-chart-2" : creative.palette === "coral" ? "bg-chart-3" : "bg-primary"
  return <div className="relative flex aspect-[4/3] flex-col overflow-hidden rounded-xl border border-border bg-secondary/45 p-5"><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{creative.channel} · {creative.format}</span><span className={`size-2 rounded-full ${accent}`} /></div><div className="my-auto"><p className="max-w-[18rem] text-pretty text-2xl font-semibold leading-tight tracking-tight text-foreground">{creative.title}</p><p className="mt-3 max-w-[19rem] text-xs leading-relaxed text-muted-foreground">{creative.message}</p></div><div className="flex items-center gap-2 text-xs font-medium text-foreground"><Sparkles className="size-4 text-primary" />{creative.cta}</div><div className={`absolute -bottom-10 -right-10 size-36 rounded-full ${accent} opacity-10`} /></div>
}

function OpportunityDrawer({ opportunity, onClose }: { opportunity: MarketingOpportunity; onClose: () => void }) {
  const evidence = marketingSignals.find((signal) => signal.title === opportunity.signal)
  return <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="opportunity-title"><button aria-label="Close opportunity detail" className="absolute inset-0 cursor-default" onClick={onClose} /><aside className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl"><header className="flex items-start justify-between border-b border-border p-6"><div><div className="flex items-center gap-2"><Status value={opportunity.status} /><DemoTag /></div><h2 id="opportunity-title" className="mt-4 text-balance text-2xl font-semibold tracking-tight text-foreground">{opportunity.title}</h2></div><button onClick={onClose} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" /></button></header><div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6"><TraceStep icon={Radio} label="Signal" text={opportunity.signal} meta={evidence ? `${evidence.observed} · ${evidence.freshness}` : undefined} /><TraceStep icon={BrainCircuit} label="Interpretation" text={opportunity.insight} /><TraceStep icon={Search} label="Reasoning" text={opportunity.reasoning} /><TraceStep icon={Megaphone} label="Recommended action" text={opportunity.action} /><TraceStep icon={Target} label="Expected outcome" text={opportunity.expected} meta={`${opportunity.reach} · ${opportunity.confidence}% confidence`} /><div className="rounded-xl border border-warn/25 bg-warn/10 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-warn">Execution boundary</p><p className="mt-2 text-sm leading-relaxed text-foreground">Publishing and campaign mutations require approval. This command center does not imply an external action occurred.</p></div></div></aside></div>
}

function TraceStep({ icon: Icon, label, text, meta }: { icon: typeof Radio; label: string; text: string; meta?: string }) {
  return <div className="grid grid-cols-[2rem_1fr] gap-3"><span className="flex size-8 items-center justify-center rounded-lg border border-border bg-secondary"><Icon className="size-4 text-primary" /></span><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 text-sm leading-relaxed text-foreground">{text}</p>{meta && <p className="mt-2 text-xs text-muted-foreground">{meta}</p>}</div></div>
}

function CreativeDrawer({ creative, onClose }: { creative: MarketingCreative; onClose: () => void }) {
  const opportunity = marketingOpportunities.find((item) => item.id === creative.opportunityId)
  return <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="creative-title"><button aria-label="Close creative detail" className="absolute inset-0 cursor-default" onClick={onClose} /><aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl"><header className="flex items-start justify-between border-b border-border p-6"><div><div className="flex items-center gap-2"><span className="rounded-full border border-border bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{creative.status}</span><DemoTag /></div><h2 id="creative-title" className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{creative.title}</h2></div><button onClick={onClose} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" /></button></header><div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6"><CreativePreview creative={creative} /><div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3"><MetaCell label="Channel" value={creative.channel} /><MetaCell label="Format" value={creative.format} /><MetaCell label="State" value={creative.status} /></div><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">Strategy rationale</p><p className="mt-2 text-sm leading-relaxed text-foreground">{opportunity?.reasoning ?? "No strategy rationale recorded."}</p></div><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">Source opportunity</p><p className="mt-2 text-sm font-medium text-foreground">{opportunity?.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{opportunity?.signal}</p></div><div className="rounded-xl border border-border bg-secondary/40 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Version note</p><p className="mt-2 text-xs leading-relaxed text-foreground">This is a demo creative artifact. No campaign platform is connected and no publishing event is recorded.</p></div></div></aside></div>
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return <div className="bg-card p-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium text-foreground">{value}</p></div>
}

function LiveExecution({ execution, workerName, taskTitle }: { execution: WorkerExecution; workerName: string; taskTitle: string }) {
  return <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary"><Bot className="size-5 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-foreground">{workerName}</p><Status value={execution.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{taskTitle}</p></div><div className="hidden text-right sm:block"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Started</p><p className="mt-1 text-xs text-foreground">{new Date(execution.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>
}

export function MarketingCommandCenter() {
  const state = useWorkforce()
  const [selectedOpportunity, setSelectedOpportunity] = useState<MarketingOpportunity | null>(null)
  const [selectedCreative, setSelectedCreative] = useState<MarketingCreative | null>(null)
  useEffect(() => { void workforceStore.hydrate() }, [])
  useEffect(() => {
    if (!selectedOpportunity && !selectedCreative) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedOpportunity(null)
        setSelectedCreative(null)
      }
    }
    window.addEventListener("keydown", dismiss)
    return () => window.removeEventListener("keydown", dismiss)
  }, [selectedOpportunity, selectedCreative])

  const liveExecutions = useMemo(() => state.executions.filter((item) => item.status === "running" || item.status === "queued" || item.status === "pending_approval").slice(0, 4), [state.executions])
  const completed = state.executions.filter((item) => item.status === "completed").length
  const workerById = new Map(state.workers.map((worker) => [worker.id, worker]))
  const taskById = new Map(state.tasks.map((task) => [task.id, task]))

  return <main className="min-h-screen bg-background text-foreground"><section className="border-b border-border"><div className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8"><div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Agent Smith · Marketing Command Center</span><DemoTag /></div><h1 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">An autonomous marketing department you can inspect.</h1><p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">Signals enter the Fabric. Specialized workers investigate, reason, create, execute within policy, and connect their work to measurable business outcomes.</p></div><div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border"><HeroMetric value={state.hydrated ? String(state.workers.length) : "—"} label="Real workers" /><HeroMetric value={state.hydrated ? String(liveExecutions.length) : "—"} label="Active now" /><HeroMetric value={state.hydrated ? String(completed) : "—"} label="Completed" /></div></div><div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-5">{["Signal detected", "Worker investigates", "Strategy formed", "Creative produced", "Outcome measured"].map((label, index) => <div key={label} className="flex items-center gap-3 bg-card p-4"><span className="flex size-7 items-center justify-center rounded-full border border-primary/25 bg-primary/10 font-mono text-[9px] text-primary">{index + 1}</span><span className="text-xs font-medium text-foreground">{label}</span>{index < 4 && <ChevronRight className="ml-auto hidden size-3 text-muted-foreground md:block" />}</div>)}</div></div></section>

  <div className="mx-auto flex max-w-[1440px] flex-col gap-14 px-5 py-12 sm:px-8"><section><SectionTitle eyebrow="Signal intelligence" title="What changed in the market" aside={<span className="hidden text-xs text-muted-foreground sm:block">4 monitored systems · fixtures clearly labeled</span>} /><div className="mt-6 grid gap-4 lg:grid-cols-2">{marketingSignals.map((signal) => <article key={signal.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary"><Database className="size-4 text-primary" /></span><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{signal.source} · {signal.freshness}</p><Status value={signal.status} /></div></div><MiniSignalChart /></div><h3 className="mt-5 text-pretty text-lg font-semibold text-foreground">{signal.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{signal.summary}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-xs text-muted-foreground">{signal.observed}</span><span className="font-mono text-xs text-foreground">{signal.confidence}% confidence</span></div></article>)}</div></section>

  <section><SectionTitle eyebrow="Opportunity queue" title="Prioritized decisions, not raw alerts" aside={<DemoTag />} /><div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">{marketingOpportunities.map((opportunity, index) => <button key={opportunity.id} onClick={() => setSelectedOpportunity(opportunity)} className="grid w-full gap-5 border-b border-border p-5 text-left transition-colors last:border-b-0 hover:bg-secondary/40 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[9px] text-muted-foreground">0{index + 1}</span><Status value={opportunity.status} /><span className="rounded-full border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-foreground">{opportunity.impact} impact</span></div><h3 className="mt-3 text-lg font-semibold text-foreground">{opportunity.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{opportunity.insight}</p></div><div className="border-l border-border pl-5"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">Recommended action</p><p className="mt-2 text-xs leading-relaxed text-foreground">{opportunity.action}</p></div><div className="flex min-w-32 items-center justify-between gap-4 lg:flex-col lg:items-end lg:justify-center"><div className="text-right"><p className="text-lg font-semibold text-foreground">{opportunity.expected}</p><p className="mt-1 text-xs text-muted-foreground">{opportunity.confidence}% confidence</p></div><ArrowRight className="size-4 text-primary" /></div></button>)}</div></section>

  <section><SectionTitle eyebrow="Creative output wall" title="Strategy becoming market-facing work" aside={<span className="text-xs text-muted-foreground">Click any artifact for rationale</span>} /><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{marketingCreatives.map((creative) => <button key={creative.id} onClick={() => setSelectedCreative(creative)} className="group text-left"><CreativePreview creative={creative} /><div className="mt-3 flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-foreground">{creative.title}</p><p className="mt-1 text-xs text-muted-foreground">{creative.channel} · {creative.status}</p></div><Eye className="size-4 text-muted-foreground transition-colors group-hover:text-primary" /></div></button>)}</div></section>

  <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]"><div><SectionTitle eyebrow="Executive brief" title="The 30-second operating picture" /><div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">{executiveInsights.map((item, index) => <div key={item.label} className="grid gap-3 border-b border-border p-5 last:border-b-0 sm:grid-cols-[9rem_1fr]"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">0{index + 1} · {item.label}</p><p className="text-sm leading-relaxed text-foreground">{item.value}</p></div>)}</div></div><div><SectionTitle eyebrow="Business impact" title="Measured outcomes" /><div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">{impactRows.map((row) => <div key={row.label} className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"><div><p className="text-xs text-muted-foreground">{row.label}</p><p className="mt-1 text-xl font-semibold text-foreground">{row.value}</p></div><div className="text-right"><p className={row.tone === "positive" ? "text-sm font-medium text-grow" : "text-sm font-medium text-muted-foreground"}>{row.change}</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">{row.provenance}</p></div></div>)}</div></div></section>

  <section><SectionTitle eyebrow="Live workforce" title="Real execution state from the Worker ledger" aside={<span className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDot className="size-3 text-grow" />Persisted state</span>} /><div className="mt-6 grid gap-4 lg:grid-cols-[1fr_20rem]">{!state.hydrated ? <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading authenticated workforce state…</div> : state.notice ? <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-8 text-sm text-destructive">{state.notice}</div> : liveExecutions.length ? <div className="flex flex-col gap-3">{liveExecutions.map((execution) => <LiveExecution key={execution.id} execution={execution} workerName={workerById.get(execution.workerId)?.identity.name ?? "Unknown worker"} taskTitle={taskById.get(execution.taskId)?.title ?? "Untitled task"} />)}</div> : <div className="rounded-2xl border border-dashed border-border bg-card p-8"><div className="flex size-10 items-center justify-center rounded-xl bg-secondary"><Clock3 className="size-5 text-muted-foreground" /></div><h3 className="mt-4 text-base font-semibold text-foreground">No worker is executing now</h3><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">This is a real empty state. Launch or schedule a released Marketing worker in Studio to populate live activity.</p></div>}<aside className="rounded-2xl border border-border bg-card p-5"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">Governance snapshot</p><div className="mt-5 flex flex-col gap-4"><GovernanceRow icon={CheckCircle2} label="Persisted workers" value={state.hydrated ? String(state.workers.length) : "—"} /><GovernanceRow icon={FileText} label="Recorded outputs" value={state.hydrated ? String(state.outputs.length) : "—"} /><GovernanceRow icon={Gauge} label="Recorded metrics" value={state.hydrated ? String(state.metrics.length) : "—"} /><GovernanceRow icon={Layers3} label="Pending approvals" value={state.hydrated ? String(state.executions.filter((item) => item.status === "pending_approval").length) : "—"} /></div></aside></div></section></div>

  {selectedOpportunity && <OpportunityDrawer opportunity={selectedOpportunity} onClose={() => setSelectedOpportunity(null)} />}{selectedCreative && <CreativeDrawer creative={selectedCreative} onClose={() => setSelectedCreative(null)} />}</main>
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return <div className="min-w-28 bg-card p-4"><p className="font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{label}</p></div>
}

function GovernanceRow({ icon: Icon, label, value }: { icon: typeof CheckCircle2; label: string; value: string }) {
  return <div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary"><Icon className="size-4 text-primary" /></span><span className="flex-1 text-xs text-muted-foreground">{label}</span><span className="font-mono text-sm text-foreground">{value}</span></div>
}

"use client"

import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Factory,
  FileOutput,
  Gauge,
  Plus,
  ShieldAlert,
  Workflow,
} from "lucide-react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useEffect, useMemo } from "react"
import { TopNav } from "@/components/studio/top-nav"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

const ACTIVE = new Set(["queued", "running", "pending_approval"])

export function ProductHome() {
  const { status } = useSession()
  const state = useWorkforce()
  useEffect(() => { if (status === "authenticated") void workforceStore.hydrate() }, [status])

  const recentEvents = useMemo(() => [...state.events].sort((a, b) => b.timestamp - a.timestamp).slice(0, 7), [state.events])
  const recentOutputs = useMemo(() => [...state.outputs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [state.outputs])
  const activeRuns = state.executions.filter((item) => ACTIVE.has(item.status))
  const completed = state.executions.filter((item) => item.status === "completed")
  const issues = state.executions.filter((item) => item.status === "failed" || item.status === "blocked" || item.status === "pending_approval")
  const successRate = state.executions.length ? Math.round((completed.length / state.executions.length) * 100) : null
  const taskById = new Map(state.tasks.map((task) => [task.id, task]))
  const workerById = new Map(state.workers.map((worker) => [worker.id, worker]))

  // Phase 4 §19 — Potential value (ESTIMATED, from real persisted
  // Opportunities/Decisions) is kept visually and numerically separate
  // from any notion of realized value, which doesn't exist yet (no
  // execution connector exists anywhere in this codebase). Never
  // combined into one misleading total.
  const potentialEconomicValue = state.opportunities.reduce((s, o) => s + o.expectedValue, 0)
  const cashReleasedPotential = state.decisions.reduce((s, d) => s + d.economicImpact.cashRelease, 0)
  const approvalRequiredCount = state.decisions.filter((d) => d.approvalStatus === "REQUIRED").length

  return <div className="min-h-dvh bg-background text-foreground"><TopNav /><main id="main-content" className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Workspace overview</p><h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">AI workforce operations</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Monitor live work, resolve operating issues, and move from a business objective to a released Worker.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/factory" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground"><Plus className="size-3.5" />New Worker</Link><Link href="/studio" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground"><Workflow className="size-3.5" />Open Studio</Link></div>
    </header>

    {!state.hydrated ? <StatePanel icon={Clock3} title="Loading workspace" body="Reading Workers, runs, and outputs from the authenticated organization ledger." /> : state.notice ? <StatePanel icon={CircleAlert} title="Workspace unavailable" body={state.notice} /> : state.workers.length === 0 ? <FirstRun /> : <>
      {/* Business/economic value before technical complexity (§19) — a
          real Financial Intelligence result only appears once real
          Opportunities/Decisions have been persisted; otherwise this
          honestly says so instead of showing a fabricated $0. */}
      {(state.opportunities.length > 0 || state.decisions.length > 0) && (
        <Link href="/opportunities" className="mt-6 block rounded-xl border border-primary/25 bg-primary/5 p-6 transition-colors hover:border-primary/40">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Financial Intelligence — potential economic value (ESTIMATED)</p>
          <div className="mt-3 grid gap-6 sm:grid-cols-3">
            <div><p className="font-mono text-3xl font-semibold tabular-nums text-foreground">${Math.round(potentialEconomicValue).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Potential economic value · {state.opportunities.length} opportunit{state.opportunities.length === 1 ? "y" : "ies"}</p></div>
            <div><p className="font-mono text-3xl font-semibold tabular-nums text-foreground">${Math.round(cashReleasedPotential).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Cash released potential · {state.decisions.length} decision{state.decisions.length === 1 ? "" : "s"}</p></div>
            <div><p className="font-mono text-3xl font-semibold tabular-nums text-foreground">{approvalRequiredCount}</p><p className="mt-1 text-xs text-muted-foreground">Awaiting approval</p></div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Estimated from the current DEMO financial dataset — not realized, not executed. Realized value is not yet available: no real banking/ERP/payment connector exists.</p>
        </Link>
      )}

      <section aria-label="Workforce metrics" className="mt-6 grid overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5 lg:gap-px">
        <Metric label="Workers" value={state.workers.length} detail={`${state.workers.filter((item) => item.status === "live").length} live`} />
        <Metric label="Active runs" value={activeRuns.length} detail="Queued, running, approval" />
        <Metric label="Outputs" value={state.outputs.length} detail="Persisted artifacts" />
        <Metric label="Success rate" value={successRate == null ? "—" : `${successRate}%`} detail={`${state.executions.length} total runs`} />
        <Metric label="Issues" value={issues.length} detail="Blocked, failed, approval" tone={issues.length ? "warn" : "normal"} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.75fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Active work" eyebrow="Run queue" href="/outputs">
            {activeRuns.length ? <div className="divide-y divide-border">{activeRuns.slice(0, 6).map((run) => <Link href="/outputs" key={run.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/40"><RunState status={run.status} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{taskById.get(run.taskId)?.title ?? "Untitled execution"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{workerById.get(run.workerId)?.identity.name ?? "Worker"}</p></div><span className="hidden font-mono text-[9px] text-muted-foreground sm:block">{new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><ArrowRight className="size-3.5 text-muted-foreground" /></Link>)}</div> : <InlineEmpty icon={CheckCircle2} title="No active runs" body="Your workforce is currently idle." />}
          </Panel>

          <Panel title="Workers" eyebrow="Deployed capacity" href="/workforce">
            <div className="divide-y divide-border">{state.workers.slice(0, 5).map((worker) => { const runs = state.executions.filter((run) => run.workerId === worker.id); const latest = [...runs].sort((a, b) => b.startedAt - a.startedAt)[0]; return <Link href={`/workforce/${worker.id}`} key={worker.id} className="grid gap-3 px-4 py-4 hover:bg-secondary/40 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary"><Bot className="size-3.5" /></span><p className="truncate text-sm font-medium">{worker.identity.name}</p><span className="font-mono text-[9px] uppercase text-grow">{worker.status}</span></div><p className="mt-2 truncate text-xs text-muted-foreground">{worker.mission || "Mission not configured"}</p></div><div className="font-mono text-[9px] uppercase text-muted-foreground">{runs.length} runs · {worker.skills.filter((skill) => skill.enabled).length} skills</div><div className="font-mono text-[9px] uppercase text-muted-foreground">{latest ? latest.status.replaceAll("_", " ") : "No runs"}</div></Link> })}</div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Needs attention" eyebrow="Operating issues" href="/approvals">
            {issues.length ? <div className="divide-y divide-border">{issues.slice(0, 5).map((run) => <Link href={run.status === "pending_approval" ? "/approvals" : "/outputs"} key={run.id} className="block px-4 py-3.5 hover:bg-secondary/40"><div className="flex items-center justify-between gap-3"><RunState status={run.status} /><span className="font-mono text-[9px] text-muted-foreground">{new Date(run.startedAt).toLocaleDateString()}</span></div><p className="mt-2 truncate text-sm font-medium">{taskById.get(run.taskId)?.title ?? "Execution issue"}</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{run.blockedReason ?? (run.reasonCode ? run.reasonCode.replaceAll("_", " ") : "Review execution evidence.")}</p></Link>)}</div> : <InlineEmpty icon={ShieldAlert} title="No open issues" body="No blocked, failed, or approval-gated work." />}
          </Panel>

          <Panel title="Recent outputs" eyebrow="Persisted artifacts" href="/outputs">
            {recentOutputs.length ? <div className="divide-y divide-border">{recentOutputs.map((output) => <Link href="/outputs" key={output.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/40"><FileOutput className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{output.title || output.type.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">{output.type.replaceAll("_", " ")}</p></div><span className="font-mono text-[9px] text-muted-foreground">{new Date(output.createdAt).toLocaleDateString()}</span></Link>)}</div> : <InlineEmpty icon={FileOutput} title="No outputs yet" body="Outputs appear after a Worker completes real work." />}
          </Panel>

          <Panel title="Recent events" eyebrow="Organization ledger" href="/observatory">
            {recentEvents.length ? <div className="divide-y divide-border">{recentEvents.map((event) => <div key={event.id} className="flex items-center gap-3 px-4 py-3"><Activity className="size-3.5 text-primary" /><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{event.type.replaceAll("_", " ")}</span><span className="font-mono text-[9px] text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>)}</div> : <InlineEmpty icon={Activity} title="No events yet" body="Execution events will stream here." />}
          </Panel>
        </div>
      </div>
    </>}
  </main></div>
}

function Metric({ label, value, detail, tone = "normal" }: { label: string; value: string | number; detail: string; tone?: "normal" | "warn" }) { return <div className="bg-card px-4 py-4"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : "text-foreground"}`}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div> }
function RunState({ status }: { status: string }) { const tone = status === "completed" ? "text-grow" : status === "failed" ? "text-destructive" : status === "blocked" || status === "pending_approval" ? "text-warn" : "text-primary"; return <span className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] ${tone}`}>{status.replaceAll("_", " ")}</span> }
function Panel({ title, eyebrow, href, children }: { title: string; eyebrow: string; href: string; children: React.ReactNode }) { return <section className="overflow-hidden rounded-xl border border-border bg-card/70"><header className="flex items-end justify-between gap-4 border-b border-border px-4 py-3.5"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-1 text-sm font-semibold">{title}</h2></div><Link href={href} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">View all <ArrowRight className="size-3" /></Link></header>{children}</section> }
function InlineEmpty({ icon: Icon, title, body }: { icon: typeof Activity; title: string; body: string }) { return <div className="flex items-start gap-3 px-4 py-6"><Icon className="mt-0.5 size-4 text-primary" /><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p></div></div> }
function StatePanel({ icon: Icon, title, body }: { icon: typeof Activity; title: string; body: string }) { return <div className="mt-8 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-8 text-center"><Icon className="size-5 text-primary" /><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">{body}</p></div> }
function FirstRun() { return <section className="mt-8 overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-6 sm:px-7"><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">Empty organization ledger</p><h2 className="mt-2 text-xl font-semibold">Deploy your first Worker</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Start with a business objective, review the generated blueprint, configure capabilities, then build and release a real version.</p></div><div className="grid md:grid-cols-3"><FirstStep icon={Factory} title="1. Define the objective" body="Turn an operational goal into a Worker blueprint." href="/factory" /><FirstStep icon={Workflow} title="2. Configure and build" body="Set skills, tools, knowledge, behavior, and release policy." href="/studio" /><FirstStep icon={Gauge} title="3. Run and observe" body="Execute real work and inspect persisted evidence." href="/observatory" /></div></section> }
function FirstStep({ icon: Icon, title, body, href }: { icon: typeof Activity; title: string; body: string; href: string }) { return <Link href={href} className="border-b border-border p-5 last:border-b-0 hover:bg-secondary/40 md:border-b-0 md:border-r md:last:border-r-0"><Icon className="size-4 text-primary" /><p className="mt-5 text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{body}</p><span className="mt-5 inline-flex items-center gap-1 text-xs text-primary">Open <ArrowRight className="size-3" /></span></Link> }

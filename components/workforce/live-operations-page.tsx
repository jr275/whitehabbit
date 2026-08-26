"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { Activity, ArrowRight, Bot, CheckCircle2, CircleAlert, Clock3, FileCheck2, Gauge, ShieldCheck, Sparkles } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"
import type { WorkerExecution } from "@/lib/workforce/model"

type PageKind = "workforce" | "approvals" | "outcomes" | "evolve"

const COPY: Record<PageKind, { eyebrow: string; title: string; description: string }> = {
  workforce: { eyebrow: "Operations", title: "Your live workforce", description: "Workers, runs, outputs, and blocked work projected directly from the persisted execution ledger." },
  approvals: { eyebrow: "Human-in-the-loop", title: "Approval queue", description: "Runs that reached a durable approval boundary. Decision mutation is not exposed until a resume contract exists." },
  outcomes: { eyebrow: "Business results", title: "Outcomes ledger", description: "Recorded business events and metrics attributed to persisted Workers and executions." },
  evolve: { eyebrow: "Compounding know-how", title: "Evidence for evolution", description: "Recommendations require enough persisted run and quality evidence. The system will not invent them from fixtures." },
}

function Status({ execution }: { execution: WorkerExecution }) {
  const tone = execution.status === "completed" ? "text-grow" : execution.status === "failed" ? "text-destructive" : execution.status === "blocked" || execution.status === "pending_approval" ? "text-warn" : "text-primary"
  return <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${tone}`}>{execution.status.replaceAll("_", " ")}</span>
}

export function LiveOperationsPage({ kind }: { kind: PageKind }) {
  const state = useWorkforce()
  useEffect(() => { void workforceStore.hydrate() }, [])
  const copy = COPY[kind]
  const workerById = useMemo(() => new Map(state.workers.map((worker) => [worker.id, worker])), [state.workers])
  const taskById = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks])
  const pending = state.executions.filter((execution) => execution.status === "pending_approval")
  const completed = state.executions.filter((execution) => execution.status === "completed")
  const failed = state.executions.filter((execution) => execution.status === "failed" || execution.status === "blocked")

  return <div className="min-h-dvh bg-background bg-substrate"><WorkforceNav /><main id="main-content" className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8"><header><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">{copy.eyebrow}</p><h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">{copy.title}</h1><p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{copy.description}</p></header>{!state.hydrated ? <Empty icon={Clock3} title="Loading persisted state" text="Reading the authenticated organization ledger." /> : state.notice ? <Empty icon={CircleAlert} title="State unavailable" text={state.notice} /> : kind === "workforce" ? <Workforce workers={state.workers} executions={state.executions} outputs={state.outputs.length} completed={completed.length} failed={failed.length} /> : kind === "approvals" ? <Approvals executions={pending} workerById={workerById} taskById={taskById} /> : kind === "outcomes" ? <Outcomes events={state.businessEvents} metrics={state.metrics} workerById={workerById} /> : <Evolve executions={state.executions} outputs={state.outputs} workers={state.workers} />}</main></div>
}

function Workforce({ workers, executions, outputs, completed, failed }: { workers: ReturnType<typeof useWorkforce>["workers"]; executions: WorkerExecution[]; outputs: number; completed: number; failed: number }) {
  const active = executions.filter((execution) => ["queued", "running", "pending_approval"].includes(execution.status)).length
  return <><div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-6"><Stat label="Workers" value={String(workers.length)} /><Stat label="Active runs" value={String(active)} /><Stat label="Outputs" value={String(outputs)} /><Stat label="Executions" value={String(executions.length)} /><Stat label="Completed" value={String(completed)} /><Stat label="Blocked / failed" value={String(failed)} /></div><div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-card/50 px-4 py-3"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Super Agent activity</p><p className="mt-1 text-xs text-muted-foreground">Unavailable until orchestration persistence and run APIs are connected.</p></div><span className="font-mono text-[9px] uppercase text-muted-foreground">0 available</span></div><section className="mt-8 grid gap-4 md:grid-cols-2">{workers.length ? workers.map((worker) => { const runs = executions.filter((item) => item.workerId === worker.id); const latest = [...runs].sort((a, b) => b.startedAt - a.startedAt)[0]; return <Link key={worker.id} href={`/workforce/${worker.id}`} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"><div className="flex items-start justify-between gap-4"><div><p className="text-base font-semibold text-foreground">{worker.identity.name}</p><p className="mt-1 text-xs text-muted-foreground">{worker.identity.role} · {worker.status}</p></div><Bot className="size-5 text-primary" /></div><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{worker.mission || "Mission not configured."}</p><div className="mt-5 flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{latest ? `${latest.status.replaceAll("_", " ")} · ${new Date(latest.startedAt).toLocaleDateString()}` : `${runs.length} persisted runs`}</span><ArrowRight className="size-4 text-primary" /></div></Link> }) : <Empty icon={Bot} title="No Workers yet" text="Create a draft in Studio. This organization has no seeded workforce." />}</section></>
}

function Approvals({ executions, workerById, taskById }: { executions: WorkerExecution[]; workerById: Map<string, ReturnType<typeof useWorkforce>["workers"][number]>; taskById: Map<string, ReturnType<typeof useWorkforce>["tasks"][number]> }) {
  return <section className="mt-8"><div className="rounded-xl border border-warn/25 bg-warn/5 p-4"><p className="text-sm text-foreground">Approval decisions are read-only in this release.</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The runtime persists approval boundaries, but no durable approve/deny-and-resume endpoint exists. Mutating controls are intentionally unavailable.</p></div><div className="mt-4 flex flex-col gap-3">{executions.length ? executions.map((execution) => <article key={execution.id} className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><Status execution={execution} /><span className="font-mono text-[9px] text-muted-foreground">{new Date(execution.startedAt).toLocaleString()}</span></div><h2 className="mt-3 text-base font-semibold text-foreground">{taskById.get(execution.taskId)?.title ?? "Approval-gated execution"}</h2><p className="mt-1 text-sm text-muted-foreground">{workerById.get(execution.workerId)?.identity.name ?? "Worker"} · {execution.blockedReason ?? "Approval required by runtime policy."}</p></article>) : <Empty icon={ShieldCheck} title="No pending approvals" text="No persisted execution is currently waiting for approval." />}</div></section>
}

function Outcomes({ events, metrics, workerById }: { events: ReturnType<typeof useWorkforce>["businessEvents"]; metrics: ReturnType<typeof useWorkforce>["metrics"]; workerById: Map<string, ReturnType<typeof useWorkforce>["workers"][number]> }) {
  return <section className="mt-8"><div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3"><Stat label="Business events" value={String(events.length)} /><Stat label="Metric records" value={String(metrics.length)} /><Stat label="Attributed workers" value={String(new Set([...events.map((item) => item.workerId), ...metrics.map((item) => item.workerId)]).size)} /></div><div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">{events.length ? events.map((event) => <div key={event.id} className="border-b border-border p-5 last:border-0"><div className="flex items-center justify-between gap-3"><p className="font-medium text-foreground">{event.type.replaceAll("_", " ")}</p><span className="font-mono text-[9px] text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</span></div><p className="mt-2 text-sm text-muted-foreground">{workerById.get(event.workerId)?.identity.name ?? "Worker"} · Recorded payload available in the execution ledger.</p></div>) : <Empty icon={FileCheck2} title="No outcomes recorded" text="Completed runs have not emitted business events or metrics yet." />}</div></section>
}

function Evolve({ executions, outputs, workers }: { executions: WorkerExecution[]; outputs: ReturnType<typeof useWorkforce>["outputs"]; workers: ReturnType<typeof useWorkforce>["workers"] }) {
  const evaluated = outputs.filter((output) => output.qualityScore != null)
  const enough = executions.length >= 5 && evaluated.length >= 3
  return <section className="mt-8"><div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3"><Stat label="Persisted runs" value={String(executions.length)} /><Stat label="Evaluated outputs" value={String(evaluated.length)} /><Stat label="Workers observed" value={String(workers.length)} /></div>{enough ? <Empty icon={Sparkles} title="Evidence available" text="Recommendation mutation is blocked until versioned improvement proposals and acceptance audit APIs are implemented." /> : <Empty icon={Gauge} title="Insufficient evidence" text="At least five persisted runs and three evaluated outputs are required before proposing workforce changes." />}</section>
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="bg-card p-4"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></div> }
function Empty({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) { return <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center"><Icon className="size-6 text-primary" /><p className="mt-4 text-base font-semibold text-foreground">{title}</p><p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{text}</p></div> }

"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Bot, Play, ShieldAlert } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

export default function WorkerDetailPage() {
  const params = useParams<{ id: string }>()
  const state = useWorkforce()
  useEffect(() => { void workforceStore.hydrate() }, [])
  const worker = state.workers.find((item) => item.id === params.id)
  const runs = useMemo(() => state.executions.filter((item) => item.workerId === params.id).slice(0, 12), [state.executions, params.id])
  const taskById = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks])

  if (!state.hydrated) return <Shell><p className="text-sm text-muted-foreground">Loading persisted Worker state…</p></Shell>
  if (!worker) return <Shell><p className="text-sm text-muted-foreground">Worker not found in this organization.</p></Shell>

  const running = workforceStore.isRunning(worker.id)
  return <div className="min-h-dvh bg-background bg-substrate text-foreground"><WorkforceNav /><main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8"><Link href="/workforce" className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Workforce</Link><header className="mt-6 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-start"><span className="flex size-16 items-center justify-center rounded-xl border border-border bg-card"><Bot className="size-7 text-primary" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">{worker.identity.name}</h1><span className="rounded-full border border-border bg-card px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{worker.status}</span></div><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{worker.identity.role} · {worker.autonomy} autonomy</p><p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{worker.mission || "Mission not configured."}</p></div><button type="button" disabled={running || worker.status !== "live"} onClick={() => void workforceStore.runWorker(worker.id)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><Play className="size-4" />{running ? "Running" : "Run released version"}</button></header><section className="mt-8 grid gap-4 sm:grid-cols-3"><Stat label="Enabled skills" value={String(worker.skills.filter((item) => item.enabled).length)} /><Stat label="Knowledge sources" value={String(worker.knowledge.length)} /><Stat label="Persisted runs" value={String(runs.length)} /></section><section className="mt-8"><h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Execution history</h2><div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">{runs.length ? runs.map((run) => <article key={run.id} className="border-b border-border p-4 last:border-0"><div className="flex items-center justify-between gap-4"><p className="font-medium text-foreground">{taskById.get(run.taskId)?.title ?? "Worker execution"}</p><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{run.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-muted-foreground">Started {new Date(run.startedAt).toLocaleString()}{run.blockedReason ? ` · ${run.blockedReason}` : ""}</p></article>) : <div className="flex flex-col items-center px-5 py-12 text-center"><ShieldAlert className="size-5 text-primary" /><p className="mt-3 text-sm font-medium">No persisted executions</p><p className="mt-1 text-xs text-muted-foreground">Build, test, and release this Worker in Studio before running it here.</p></div>}</div></section></main></div>
}

function Shell({ children }: { children: React.ReactNode }) { return <div className="min-h-dvh bg-background bg-substrate"><WorkforceNav /><main className="mx-auto max-w-[900px] px-5 py-16 text-center sm:px-8">{children}<Link href="/workforce" className="mt-4 inline-block text-sm text-primary hover:underline">Back to workforce</Link></main></div> }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-card p-4"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div> }

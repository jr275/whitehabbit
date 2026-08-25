"use client"

import { ArrowLeft, ArrowRight, Check, Loader2, ShieldAlert, Sparkles } from "lucide-react"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { TopNav } from "@/components/studio/top-nav"
import { agentHealth, agentIdentity } from "@/lib/workforce/agent-identity"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"
import type { AgentBlueprint } from "@/lib/workforce/seed"

type Phase = "brief" | "generating" | "review" | "creating" | "ready"

const ASSEMBLY_STAGES = [
  "Understanding objective",
  "Defining identity",
  "Creating mission",
  "Selecting skills",
  "Configuring knowledge",
  "Setting autonomy",
  "Preparing memory",
] as const

export function AgentFactory() {
  const router = useRouter()
  const { status } = useSession()
  const workforce = useWorkforce()
  const [phase, setPhase] = useState<Phase>("brief")
  const [objective, setObjective] = useState("")
  const [blueprint, setBlueprint] = useState<AgentBlueprint | null>(null)
  const [mode, setMode] = useState<"development" | "production">("production")
  const [error, setError] = useState<string | null>(null)
  const [assemblyStep, setAssemblyStep] = useState(0)
  const [createdWorkerId, setCreatedWorkerId] = useState<string | null>(null)
  useEffect(() => { if (status === "authenticated") void workforceStore.hydrate() }, [status])
  useEffect(() => {
    if (phase !== "generating" && phase !== "creating") { setAssemblyStep(0); return }
    const interval = window.setInterval(() => setAssemblyStep((current) => Math.min(current + 1, ASSEMBLY_STAGES.length - 1)), 650)
    return () => window.clearInterval(interval)
  }, [phase])

  async function ensureWorkspace() {
    if (status === "authenticated") return
    const email = `guest+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@whitehabbit.local`
    const password = crypto.randomUUID()
    const response = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, organizationName: "My organization" }) })
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Could not create your workspace.")
    const result = await signIn("credentials", { email, password, redirect: false })
    if (result?.error) throw new Error("Could not sign in to your workspace.")
  }

  async function generateBlueprint() {
    setError(null); setPhase("generating")
    try {
      await ensureWorkspace()
      const response = await fetch("/api/agents/blueprint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objective: objective.trim() }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? "Could not generate a blueprint.")
      setBlueprint(body.blueprint); setMode(body.mode); setPhase("review")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong."); setPhase("brief") }
  }

  async function createWorker() {
    if (!blueprint) return
    setError(null); setPhase("creating")
    try {
      const response = await fetch("/api/workers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blueprint }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? "Could not create the worker.")
      setCreatedWorkerId(body.worker.id)
      await workforceStore.hydrate()
      setPhase("ready")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong."); setPhase("review") }
  }

  const update = <K extends keyof AgentBlueprint>(key: K, value: AgentBlueprint[K]) => setBlueprint((current) => current ? { ...current, [key]: value } : current)
  const busy = phase === "generating" || phase === "creating"

  return <div className="min-h-dvh bg-background text-foreground"><TopNav /><main className="bg-substrate px-5 py-8 sm:px-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-5"><div><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-primary">Menlo Whitehabbit / Agent Factory</p><p className="mt-2 text-sm text-muted-foreground">Brief → Blueprint → Review → Create → Configure → Test → Deploy</p></div><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{phase === "review" ? "Review gate" : phase}</span></header>
      {(phase === "generating" || phase === "creating") ? <AssemblySequence activeStep={assemblyStep} objective={objective} /> : phase === "ready" && createdWorkerId ? <WorkerReady worker={workforce.workers.find((item) => item.id === createdWorkerId)} onOpen={() => router.push(`/studio?worker=${encodeURIComponent(createdWorkerId)}&step=identity`)} /> : phase !== "review" ? <section className="mx-auto flex w-full max-w-3xl flex-col gap-7 py-16 text-center">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Don&apos;t build workflows. Raise Workers.</p><h1 className="mt-5 text-balance text-4xl font-medium tracking-tight sm:text-6xl">What should your Worker do?</h1><p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">Describe the responsibility. Menlo Whitehabbit will shape a persistent digital Worker with identity, mission, skills, knowledge, autonomy, and memory.</p></div>
        <form onSubmit={(event) => { event.preventDefault(); if (objective.trim()) void generateBlueprint() }} className="flex flex-col gap-4"><textarea autoFocus value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={500} rows={5} aria-label="Agent job brief" placeholder="Find high-quality enterprise leads, qualify them against our ICP, and prepare sourced outreach briefs." className="w-full resize-none rounded-2xl border border-border bg-card/70 p-5 text-base leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"/><div className="flex items-center justify-between gap-4"><span className="font-mono text-[9px] text-muted-foreground">{objective.length}/500</span><button disabled={!objective.trim() || busy} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="size-4 animate-spin"/> : <Sparkles className="size-4"/>}{busy ? "Raising Worker" : "Assemble Worker"}</button></div></form>
      </section> : blueprint ? <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5"><div><button onClick={() => setPhase("brief")} className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3"/>Edit brief</button><h1 className="mt-5 text-3xl font-medium tracking-tight">Review the proposed blueprint</h1><p className="mt-2 text-sm text-muted-foreground">Nothing is persisted until you select Create Agent.</p></div>
          <div className="grid gap-4 rounded-2xl border border-border bg-card/70 p-5 sm:grid-cols-2"><Field label="Agent name"><input value={blueprint.name} onChange={(e) => update("name", e.target.value)} /></Field><Field label="Role"><input value={blueprint.role} onChange={(e) => update("role", e.target.value)} /></Field><Field label="Mission" wide><textarea rows={4} value={blueprint.mission} onChange={(e) => update("mission", e.target.value)} /></Field><Field label="Primary skill"><select value={blueprint.primarySkillId} onChange={(e) => update("primarySkillId", e.target.value)}>{SKILL_CATALOG.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></Field><Field label="Primary KPI"><input value={blueprint.primaryKPI} onChange={(e) => update("primaryKPI", e.target.value)} /></Field><Field label="Description" wide><textarea rows={3} value={blueprint.description} onChange={(e) => update("description", e.target.value)} /></Field></div>
        </div>
        <aside className="flex flex-col gap-4"><div className="rounded-2xl border border-border bg-card p-5"><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Contract check</p><ul className="mt-4 flex flex-col gap-3 text-xs"><CheckRow>Skill exists in runtime registry</CheckRow><CheckRow>Organization-scoped persistence</CheckRow><CheckRow>Creates as editable draft</CheckRow></ul></div><div className="rounded-2xl border border-warn/30 bg-warn/5 p-5"><div className="flex gap-3"><ShieldAlert className="size-4 shrink-0 text-warn"/><div><p className="text-xs font-medium">Not configured</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Credentials, channels, knowledge sources, schedules, and deployment remain explicit Studio steps.</p></div></div></div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Analysis mode: {mode}</p><button onClick={() => void createWorker()} disabled={busy || !blueprint.name.trim() || !blueprint.role.trim() || !blueprint.mission.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="size-4 animate-spin"/> : <ArrowRight className="size-4"/>}{busy ? "Creating Agent" : "Create Agent"}</button></aside>
      </section> : null}
      {error && <p role="alert" className="mx-auto text-sm text-destructive">{error}</p>}
      {phase === "brief" && workforce.hydrated && workforce.workers.length > 0 && <section className="border-t border-border pt-8"><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">Your AI workforce</p><h2 className="mt-2 text-2xl font-semibold">Build, configure and manage your agents.</h2></div><span className="font-mono text-[9px] uppercase text-muted-foreground">{workforce.workers.length} agents</span></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workforce.workers.map((worker) => { const identity = agentIdentity(worker); const health = agentHealth(worker); const runs = workforce.executions.filter((execution) => execution.workerId === worker.id); const lastRun = [...runs].sort((a, b) => b.startedAt - a.startedAt)[0]; return <article key={worker.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start gap-3"><img src={identity.image} alt="" className="size-12 rounded-xl object-cover"/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="truncate font-semibold">{identity.name}</h3><span className="font-mono text-[8px] uppercase text-primary">{worker.status}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{identity.role}</p></div></div><p className="mt-5 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{worker.mission || "Objective not configured."}</p><div className="mt-5 grid grid-cols-3 gap-3"><FactoryMetric label="Config" value={`${health.readiness}%`}/><FactoryMetric label="Skills" value={String(health.enabledSkills)}/><FactoryMetric label="Runs" value={String(runs.length)}/></div><p className="mt-4 font-mono text-[8px] text-muted-foreground">{lastRun ? `Last run ${new Date(lastRun.startedAt).toLocaleString()}` : "No executions yet"}</p><div className="mt-5 flex gap-2"><button onClick={() => router.push(`/studio?worker=${worker.id}`)} className="flex-1 rounded-lg bg-primary px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground">Open Studio</button><button onClick={() => router.push(`/workforce?worker=${worker.id}`)} className="rounded-lg border border-border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em]">Run</button></div></article> })}</div></section>}
    </div>
  </main></div>
}

function AssemblySequence({ activeStep, objective }: { activeStep: number; objective: string }) { return <section className="mx-auto flex w-full max-w-3xl flex-col items-center py-14 text-center"><div className="relative flex size-28 items-center justify-center rounded-[2rem] border border-primary/30 bg-card shadow-2xl shadow-primary/10"><div className="absolute inset-3 animate-pulse rounded-[1.5rem] border border-primary/20"/><Sparkles className="size-8 text-primary"/></div><p className="mt-8 font-mono text-[9px] uppercase tracking-[0.26em] text-primary">Raising your Worker</p><h1 className="mt-3 text-3xl font-medium tracking-tight">A new intelligence is taking shape.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{objective}</p><ol className="mt-10 w-full max-w-md text-left">{ASSEMBLY_STAGES.map((stage, index) => <li key={stage} className="relative flex items-center gap-4 pb-5 last:pb-0">{index < ASSEMBLY_STAGES.length - 1 && <span className="absolute left-[9px] top-5 h-[calc(100%-0.25rem)] w-px bg-border"/>}<span className={`relative flex size-5 shrink-0 items-center justify-center rounded-full border ${index < activeStep ? "border-primary bg-primary text-primary-foreground" : index === activeStep ? "animate-pulse border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground"}`}>{index < activeStep ? <Check className="size-3"/> : <span className="size-1.5 rounded-full bg-current"/>}</span><span className={`text-sm ${index <= activeStep ? "text-foreground" : "text-muted-foreground/60"}`}>{stage}</span></li>)}</ol></section> }

function WorkerReady({ worker, onOpen }: { worker?: ReturnType<typeof useWorkforce>["workers"][number]; onOpen: () => void }) { const identity = worker ? agentIdentity(worker) : null; return <section className="mx-auto flex w-full max-w-3xl flex-col items-center py-16 text-center">{identity ? <img src={identity.image} alt="" className="size-28 rounded-[2rem] object-cover shadow-2xl shadow-primary/15"/> : <div className="size-28 animate-pulse rounded-[2rem] bg-secondary"/>}<p className="mt-8 font-mono text-[9px] uppercase tracking-[0.26em] text-primary">Assembly complete</p><h1 className="mt-3 text-4xl font-medium tracking-tight">Your Worker is ready.</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">{worker ? `${worker.identity.name} has an identity, a mission, and a starting set of capabilities. Open the control center to continue raising this Worker.` : "Your persistent digital Worker has been created."}</p><button onClick={onOpen} className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground">Meet your Worker<ArrowRight className="size-4"/></button></section> }

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`flex flex-col gap-2 ${wide ? "sm:col-span-2" : ""}`}><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span><div className="[&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-sm [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-background [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-sm">{children}</div></label> }
function CheckRow({ children }: { children: React.ReactNode }) { return <li className="flex items-center gap-2"><Check className="size-3 text-grow"/><span>{children}</span></li> }
function FactoryMetric({ label, value }: { label: string; value: string }) { return <div><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div> }

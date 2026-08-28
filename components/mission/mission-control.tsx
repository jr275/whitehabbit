"use client"

/* ================================================================== *
 * MISSION CONTROL (Fase 5 — implementação da nova linguagem visual
 * definida em docs/fase1..4-*.md) — reads live API data only:
 * /api/v1/intelligence/mission (real KPIs), /api/v1/intelligence/next-action
 * (the real highest-priority pending Decision), /api/v1/intelligence/map
 * (the real Intelligence Field excerpt), /api/v1/intelligence/timeline
 * (real Signal UI feed), /api/v1/search (the real, persistent universal
 * search — never hidden behind ⌘K only). No hardcoded metrics, no fake
 * charts, no decorative numbers — a metric this tenant has no real data
 * for yet renders as "—" / "Dados ainda não disponíveis", never a
 * guessed value.
 *
 * This is not a KPI dashboard: there is no stack of independent cards.
 * The composition follows docs/fase4-composicao-telas.md §1 —
 * Comando/Busca → Estado do sistema → Campo de Inteligência (the core
 * element, a real graph excerpt with visual presence, not a small card)
 * → Sinais ativos (a real signal feed) → Ação recomendada, anchored to
 * its own object, never a generic central card.
 * ================================================================== */

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowRight, CircleAlert, Cpu, Search, X } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { MissionSnapshot, NextAction } from "@/lib/intelligence/mission"
import type { TimelineEntry } from "@/lib/intelligence/timeline"
import type { WorkflowRun } from "@/lib/workflow/types"
import type { SearchResult } from "@/lib/search"
import { ObjectInspector, useObjectInspector } from "@/components/ontology/object-inspector"
import { IntelligenceField } from "@/components/mission/intelligence-field"
import { SignalRow } from "@/components/mission/signal-row"
import { StageGrid, type Stage } from "@/components/mission/stage-grid"
import { LoadingState } from "@/components/ontology/states"
import { translateAction, translateObjectType, translatePipeline, translateStatus, translateStep } from "@/lib/ontology/pt-br"
import type { WorkflowStep } from "@/lib/workflow/types"

const RISK_TONE: Record<string, string> = { low: "text-grow", medium: "text-warn", high: "text-destructive", critical: "text-destructive" }
const RISK_LABEL: Record<string, string> = { low: "baixo", medium: "médio", high: "alto", critical: "crítico" }
const PRIORITY_LABEL: Record<string, string> = { low: "baixa", medium: "média", high: "alta", critical: "crítica" }

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  entity: "Entidade",
  opportunity: "Oportunidade",
  page: "Página",
  decision: "Decisão",
  worker: "Agente",
}
const INSPECTABLE_SEARCH_TYPES = new Set<SearchResult["type"]>(["entity", "opportunity", "page", "decision"])

/* HEADER/COMMAND — a persistent, always-visible search field (§12: the
 * search "starts to look like a universal system interface"), never
 * hidden behind a ⌘K button. Finding an object opens the same real
 * Object Inspector every other surface uses — no parallel experience. */
function CommandBar({ projectId, onOpen }: { projectId: string | null; onOpen: (ref: { type: "entity" | "opportunity" | "page" | "decision"; id: string }) => void }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const params = new URLSearchParams({ q: query.trim() })
    if (projectId) params.set("projectId", projectId)
    const timer = setTimeout(() => {
      fetch(`/api/v1/search?${params.toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((body) => {
          setResults(body.results ?? [])
          setOpen(true)
        })
        .catch((err) => {
          if (err.name !== "AbortError") setResults([])
        })
        .finally(() => setSearching(false))
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, projectId])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  function pick(result: SearchResult) {
    if (INSPECTABLE_SEARCH_TYPES.has(result.type)) onOpen({ type: result.type as "entity" | "opportunity" | "page" | "decision", id: result.id })
    else router.push(result.href)
    setOpen(false)
    setQuery("")
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 focus-within:border-primary/50">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Pesquisar entidades, oportunidades, páginas, decisões…"
          aria-label="Pesquisa universal do sistema"
          className="w-full bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); setOpen(false) }} aria-label="Limpar pesquisa" className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {open && (searching || results.length > 0) && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
          {searching && <p className="px-3 py-2.5 text-xs text-muted-foreground">Pesquisando…</p>}
          {!searching &&
            results.map((r) => (
              <button key={`${r.type}:${r.id}`} onClick={() => pick(r)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-secondary/60">
                <span className="min-w-0 flex-1 truncate text-[13px] text-popover-foreground">{r.title}</span>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-primary">{TYPE_LABEL[r.type]}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

/* ESTADO DO SISTEMA — uma linha de legenda compacta sob o título, não
 * uma faixa de KPI própria (docs/remax-knowledge-design-reference.md:
 * o número nunca é o primeiro elemento visual da tela — o objeto/grafo
 * é). Mesmo dado real de antes, tratamento tipográfico muito menor,
 * sem caixa/borda própria — nunca compete em peso visual com o Campo
 * de Inteligência logo abaixo. */
function StateItem({ label, value, tone = "text-foreground" }: { label: string; value: string | number; tone?: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap text-[12px] text-muted-foreground">
      <span className={`font-mono text-[12px] font-semibold tabular-nums ${tone}`}>{value}</span>
      {label}
    </span>
  )
}

function SystemStateStrip({ snapshot, activeRuns }: { snapshot: MissionSnapshot; activeRuns: WorkflowRun[] }) {
  return (
    <div className="relative">
      <div className="flex items-center gap-x-4 gap-y-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <StateItem label="entidades reais" value={snapshot.knowledgeAuthority.entityCount} />
        <StateItem label="páginas reais" value={snapshot.pageIntelligence.pageCount} />
        <StateItem label="em execução" value={activeRuns.length} tone={activeRuns.length > 0 ? "text-primary" : undefined} />
        <StateItem label="aguardando aprovação" value={snapshot.pendingDecisionCount} tone={snapshot.pendingDecisionCount > 0 ? "text-warn" : undefined} />
        <StateItem label="bloqueado" value={snapshot.blockedActionCount} tone={snapshot.blockedActionCount > 0 ? "text-destructive" : undefined} />
        <StateItem label="tendências em alta" value={`${snapshot.marketMomentum.risingTrendCount}/${snapshot.marketMomentum.totalTrendCount}`} tone={snapshot.marketMomentum.risingTrendCount > 0 ? "text-grow" : undefined} />
        {snapshot.pageIntelligence.avgQualityScore != null && <StateItem label="qualidade média" value={snapshot.pageIntelligence.avgQualityScore} />}
        {snapshot.informationGain.avgScore != null && <StateItem label="ganho de informação" value={`${snapshot.informationGain.avgScore}%`} />}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" aria-hidden="true" />
    </div>
  )
}

/* AÇÃO RECOMENDADA — Action UI (Fase 3 §7): verbo no infinitivo,
 * ancorada ao próprio objeto (a Decision real), motivo de bloqueio
 * sempre visível quando existir, nunca escondido. */
function ActionPanel({ nextAction, onActed, onInspect }: { nextAction: NextAction | null; onActed: () => void; onInspect: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!nextAction) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Ação recomendada</p>
        <p className="mt-2 text-[13px] text-muted-foreground">Nenhuma decisão real pendente agora — o sistema não tem nada aguardando aprovação.</p>
      </div>
    )
  }

  const { decision, plan, policy } = nextAction

  async function approveAndExecute() {
    setBusy(true)
    setError(null)
    try {
      const decideRes = await fetch(`/api/v1/intelligence/decisions/${decision.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) })
      if (!decideRes.ok) throw new Error((await decideRes.json().catch(() => null))?.error ?? "Falha ao aprovar.")
      const execRes = await fetch(`/api/v1/intelligence/decisions/${decision.id}/execute`, { method: "POST" })
      if (!execRes.ok) throw new Error((await execRes.json().catch(() => null))?.error ?? "Falha ao executar.")
      onActed()
    } catch (err) {
      setError(err instanceof Error ? err.message : "A ação falhou.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Ação recomendada</p>
            {/* Ancorada ao objeto real que a decisão afeta — nunca um
             * CTA genérico solto (docs/remax-knowledge-design-
             * reference.md: ações estão sempre conectadas ao contexto). */}
            {decision.subjectType && (
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{translateObjectType(decision.subjectType)}</span>
            )}
          </div>
          <button onClick={onInspect} className="mt-1 text-left font-serif text-[19px] font-medium tracking-tight text-foreground hover:underline">{translateAction(decision.action)}</button>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">{decision.reason}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/60 pt-3">
        <Metric label="confiança" value={`${Math.round(decision.confidence * 100)}%`} />
        <Metric label="prioridade" value={PRIORITY_LABEL[decision.priority] ?? decision.priority} />
        <Metric label="risco" value={RISK_LABEL[decision.risk] ?? decision.risk} tone={RISK_TONE[decision.risk]} />
        <Metric label="evidências" value={`${decision.evidenceIds.length}`} />
      </div>

      {/* Leitura explicável — a evidência conectada à decisão
       * (docs/remax-knowledge-design-reference.md §1.3), nunca só os
       * números soltos acima. */}
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        Recomendada com {Math.round(decision.confidence * 100)}% de confiança, risco {RISK_LABEL[decision.risk] ?? decision.risk}
        {decision.evidenceIds.length > 0 ? `, sustentada por ${decision.evidenceIds.length} evidência${decision.evidenceIds.length === 1 ? "" : "s"} real${decision.evidenceIds.length === 1 ? "" : "is"}` : ", ainda sem evidência real vinculada"}.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {plan.status === "unsupported" ? (
          <p className="flex items-center gap-2 text-[12.5px] text-warn"><AlertTriangle className="size-3.5 shrink-0" /> Ainda não é possível automatizar: {plan.unsupportedReason}</p>
        ) : (
          <>
            <button onClick={approveAndExecute} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy ? "Executando…" : "Aprovar e executar"} <ArrowRight className="size-3.5" />
            </button>
            <span className="text-[11.5px] text-muted-foreground">Agente: {plan.agentType ?? "nenhum necessário"} · custo estimado: {plan.estimatedCost.agentSteps ?? "—"} etapas</span>
          </>
        )}
        {!policy.allowed && plan.status === "supported" && <p className="text-[11.5px] text-muted-foreground">Nota: {policy.reason}</p>}
      </div>
      {error && <p className="mt-2 flex items-center gap-2 text-[12.5px] text-destructive"><CircleAlert className="size-3.5 shrink-0" /> {error}</p>}
    </div>
  )
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-mono text-[12.5px] font-medium tabular-nums ${tone}`}>{value}</span>
      <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </span>
  )
}

/* AGENTES EM AÇÃO — o sistema trabalhando, como uma grade real de
 * etapas (StageGrid, docs/remax-knowledge-design-reference.md §1.10),
 * nunca uma lista de cards com chips. A execução mais relevante (a
 * primeira "running", senão a primeira da fila) mostra seus passos
 * reais (WorkflowStep, GET /api/agent-runs/:id) — nunca etapas
 * inventadas. As demais execuções ativas ficam como uma lista densa
 * abaixo, clicável, progressive disclosure via Object Inspector (que já
 * expõe tentativa/custo/tokens/checkpoint). */
function FeaturedRunStages({ runs, onInspect }: { runs: WorkflowRun[]; onInspect: (id: string) => void }) {
  const featured = useMemo(() => runs.find((r) => r.status === "running") ?? runs[0] ?? null, [runs])
  const [steps, setSteps] = useState<WorkflowStep[] | null>(null)

  useEffect(() => {
    if (!featured) {
      setSteps(null)
      return
    }
    setSteps(null)
    fetch(`/api/agent-runs/${featured.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setSteps(body?.steps ?? []))
      .catch(() => setSteps([]))
  }, [featured])

  if (runs.length === 0) {
    return <p className="px-3 py-4 text-[12.5px] text-muted-foreground">Nenhuma execução real de agente ativa agora.</p>
  }

  const rest = featured ? runs.filter((r) => r.id !== featured.id) : runs
  const stages: Stage[] = (steps ?? []).map((s) => ({ label: translateStep(s.step), status: s.status, detail: s.error ?? undefined }))

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {featured && (
        <div>
          <button onClick={() => onInspect(featured.id)} className="flex w-full items-center gap-2 text-left hover:underline">
            <Cpu className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">{translatePipeline(featured.pipeline)} · {featured.subjectType}</span>
            <span className="shrink-0 font-mono text-[9px] uppercase text-primary">{translateStatus(featured.status)}</span>
          </button>
          <div className="mt-2">
            {steps == null ? (
              <LoadingState label="Carregando etapas reais…" />
            ) : stages.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Nenhuma etapa real registrada ainda para esta execução.</p>
            ) : (
              <StageGrid stages={stages} />
            )}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="flex flex-col divide-y divide-border border-t border-border/60 pt-1">
          {rest.slice(0, 4).map((r) => (
            <li key={r.id}>
              <button onClick={() => onInspect(r.id)} className="flex w-full items-center gap-2.5 py-2 text-left transition-colors hover:bg-secondary/40">
                <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{translatePipeline(r.pipeline)} · {r.subjectType}</span>
                <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{translateStatus(r.status)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting", "waiting_approval", "retrying"]

const INSPECTABLE = new Set(["entity", "opportunity", "page", "decision", "agent_run", "observation"])

type InspectableRef = { type: "entity" | "opportunity" | "page" | "decision" | "agent_run" | "observation"; id: string }

/** A timeline entry's own real subject — a Decision's `subjectType`/
 * `subjectId`, a Signal's `entityId`, an Action's `agentRunId` — opened
 * in the same universal Object Inspector, never a separate navigation.
 * `null` when this entry (e.g. a real Outcome) has no known inspectable
 * subject yet — the row then renders as plain text, never a dead click. */
function signalTarget(entry: TimelineEntry): InspectableRef | null {
  if (entry.type === "decision" && typeof entry.detail.subjectType === "string" && typeof entry.detail.subjectId === "string" && INSPECTABLE.has(entry.detail.subjectType)) {
    return { type: entry.detail.subjectType as InspectableRef["type"], id: entry.detail.subjectId }
  }
  if (entry.type === "decision") return { type: "decision", id: entry.id }
  if (entry.type === "signal" && typeof entry.detail.entityId === "string") return { type: "entity", id: entry.detail.entityId }
  if (entry.type === "observation") return { type: "observation", id: entry.id }
  if (entry.type === "action" && typeof entry.detail.agentRunId === "string") return { type: "agent_run", id: entry.detail.agentRunId }
  return null
}

export function MissionControl() {
  const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null)
  const [nextAction, setNextAction] = useState<NextAction | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [activeRuns, setActiveRuns] = useState<WorkflowRun[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inspector = useObjectInspector()

  async function load() {
    try {
      const missionRes = await fetch("/api/v1/intelligence/mission")
      if (!missionRes.ok) throw new Error((await missionRes.json().catch(() => null))?.error ?? "Não foi possível carregar o Mission Control.")
      const missionBody = await missionRes.json()
      setSnapshot(missionBody.snapshot)
      setProjectId(missionBody.projectId)

      const [nextRes, timelineRes, ...runResList] = await Promise.all([
        fetch("/api/v1/intelligence/next-action"),
        fetch(`/api/v1/intelligence/timeline?projectId=${missionBody.projectId}&limit=10`),
        ...ACTIVE_RUN_STATUSES.map((s) => fetch(`/api/v1/workflows?status=${s}`)),
      ])
      if (nextRes.ok) setNextAction((await nextRes.json()).nextAction)
      if (timelineRes.ok) setTimeline((await timelineRes.json()).entries)
      const runLists = await Promise.all(runResList.map((r) => (r.ok ? r.json() : { workflows: [] })))
      setActiveRuns(runLists.flatMap((b) => b.workflows as WorkflowRun[]))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o Mission Control.")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const pendingExtra = useMemo(() => (snapshot ? Math.max(0, snapshot.pendingDecisionCount - 1) : 0), [snapshot])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER/COMMAND — o estado do sistema vira uma linha de
         * legenda sob o título, nunca sua própria faixa de KPI (Fase
         * do reset RE/MAX Knowledge: o número nunca é a primeira coisa
         * que domina a tela — o Campo de Inteligência é). */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-primary">Mission Control</p>
            <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight text-foreground">Central de inteligência</h1>
            {snapshot && <div className="mt-2"><SystemStateStrip snapshot={snapshot} activeRuns={activeRuns} /></div>}
          </div>
          <div className="w-full sm:w-[420px]">
            <CommandBar projectId={projectId} onOpen={inspector.open} />
          </div>
        </div>

        {error && <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" /> {error}</div>}

        {!snapshot ? (
          <div className="mt-8"><LoadingState label="Carregando o estado real do sistema…" /></div>
        ) : (
          <>
            {/* INTELLIGENCE FIELD — the core element, logo após o header */}
            <div className="mt-5"><IntelligenceField /></div>

            {/* SINAIS ATIVOS + EXECUÇÕES ATIVAS */}
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <section className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Sinais ativos</p>
                  <a href="/intelligence/timeline" className="text-[11px] text-muted-foreground hover:text-foreground">Ver histórico completo →</a>
                </div>
                {timeline.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">Nenhum evento real registrado ainda para este projeto.</p>
                ) : (
                  <ul className="flex max-h-[280px] flex-col divide-y divide-border/60 overflow-y-auto">
                    {timeline.map((entry) => {
                      const target = signalTarget(entry)
                      return (
                        <li key={`${entry.type}:${entry.id}`}>
                          <SignalRow entry={entry} onClick={target ? () => inspector.open(target) : undefined} />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Agentes em ação</p>
                  <a href="/agents/live" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">Grafo completo <ArrowRight className="size-3" /></a>
                </div>
                <FeaturedRunStages runs={activeRuns} onInspect={(id) => inspector.open({ type: "agent_run", id })} />
              </section>
            </div>

            {/* AÇÃO RECOMENDADA */}
            <div className="mt-6">
              <ActionPanel nextAction={nextAction} onActed={() => void load()} onInspect={() => nextAction && inspector.open({ type: "decision", id: nextAction.decision.id })} />
              {(pendingExtra > 0 || snapshot.blockedActionCount > 0) && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {pendingExtra > 0 && <>{pendingExtra} outra{pendingExtra === 1 ? "" : "s"} decisão{pendingExtra === 1 ? "" : "ões"} real{pendingExtra === 1 ? "" : "is"} pendente{pendingExtra === 1 ? "" : "s"}. </>}
                  {snapshot.blockedActionCount > 0 && <>{snapshot.blockedActionCount} ação{snapshot.blockedActionCount === 1 ? "" : "ões"} bloqueada{snapshot.blockedActionCount === 1 ? "" : "s"} no momento. </>}
                  <a href="/intelligence/decisions" className="text-primary hover:underline">Abrir Central de Decisões →</a>
                </p>
              )}
            </div>
          </>
        )}
      </main>
      {inspector.isOpen && <ObjectInspector stack={inspector.stack} setStack={inspector.setStack} onClose={inspector.close} />}
    </div>
  )
}

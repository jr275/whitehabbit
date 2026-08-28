"use client"

/* ================================================================== *
 * MISSION CONTROL (docs/mission-control-ux-v2.md — reset conceitual) —
 * não é uma página composta por seções empilhadas (header/stats/grafo/
 * atividade/CTA). É um workspace com exatamente duas zonas reais sob
 * uma barra de contexto: FOCO (um objeto real sempre em foco — por
 * padrão, o objeto de maior prioridade real do sistema) e O QUE ESTÁ
 * ACONTECENDO (um único feed real unificado). Selecionar qualquer
 * coisa — resultado de busca, item do feed, relação dentro do próprio
 * Foco — sempre resulta na mesma ação: o foco muda, e a tela inteira
 * ao redor dele reage.
 *
 * Sem grafo full-width, sem "Ação Recomendada" como card independente,
 * sem "Sinais"/"Agentes" como caixas separadas. A decisão/ação de um
 * objeto aparece dentro do seu próprio painel de Foco — nunca solta.
 *
 * Dados reais apenas: /api/v1/intelligence/mission, /next-action,
 * /timeline, /api/opportunities (só para achar o foco padrão),
 * /api/v1/workflows (execuções ativas), /api/v1/search (busca
 * universal), /api/v1/objects/:type/:id (o Foco em si).
 * ================================================================== */

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CircleAlert, Search, X } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { MissionSnapshot, NextAction } from "@/lib/intelligence/mission"
import type { TimelineEntry } from "@/lib/intelligence/timeline"
import type { WorkflowRun, WorkflowStep } from "@/lib/workflow/types"
import type { SearchResult } from "@/lib/search"
import type { Opportunity } from "@/lib/opportunity/model"
import type { ObjectType } from "@/lib/ontology/object-resolver"
import { ObjectInspector, useObjectInspector } from "@/components/ontology/object-inspector"
import { SignalRow, type FeedRowItem } from "@/components/mission/signal-row"
import { StageGrid, type Stage } from "@/components/mission/stage-grid"
import { LoadingState } from "@/components/ontology/states"
import { translateAction, translatePipeline, translateStatus, translateStep } from "@/lib/ontology/pt-br"

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
const INSPECTABLE = new Set(["entity", "opportunity", "page", "decision", "agent_run", "observation"])
const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting", "waiting_approval", "retrying"]

type InspectableRef = { type: ObjectType; id: string }

/* BARRA DE CONTEXTO — identidade + busca universal sempre visível
 * (nunca escondida atrás de ⌘K). Encontrar um objeto sempre resulta na
 * mesma ação: o Foco muda para ele — nunca uma experiência paralela. */
function CommandBar({ projectId, onOpen }: { projectId: string | null; onOpen: (ref: InspectableRef) => void }) {
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
    if (INSPECTABLE_SEARCH_TYPES.has(result.type)) onOpen({ type: result.type as ObjectType, id: result.id })
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

/* Estado do sistema — legenda compacta na barra de contexto, nunca sua
 * própria zona (docs/mission-control-ux-v2.md §G). */
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

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-mono text-[12.5px] font-medium tabular-nums ${tone}`}>{value}</span>
      <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </span>
  )
}

/* DECISÃO PENDENTE — nunca um card "Ação Recomendada" independente
 * (docs/mission-control-ux-v2.md §F, item 11): só aparece quando o
 * objeto em Foco é, de fato, o sujeito real desta decisão — um
 * apêndice do próprio painel de Foco, nunca um componente solto. */
function DecisionStrip({ nextAction, onActed }: { nextAction: NextAction; onActed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    <div className="shrink-0 border-t border-border px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Decisão pendente</p>
      <p className="mt-1 text-[13.5px] font-medium text-foreground">{translateAction(decision.action)}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{decision.reason}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Metric label="confiança" value={`${Math.round(decision.confidence * 100)}%`} />
        <Metric label="prioridade" value={PRIORITY_LABEL[decision.priority] ?? decision.priority} />
        <Metric label="risco" value={RISK_LABEL[decision.risk] ?? decision.risk} tone={RISK_TONE[decision.risk]} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {plan.status === "unsupported" ? (
          <p className="flex items-center gap-2 text-[12px] text-warn"><AlertTriangle className="size-3.5 shrink-0" /> Ainda não é possível automatizar: {plan.unsupportedReason}</p>
        ) : (
          <>
            <button onClick={approveAndExecute} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy ? "Executando…" : "Aprovar e executar"}
            </button>
            <span className="text-[11px] text-muted-foreground">Agente: {plan.agentType ?? "nenhum necessário"} · custo estimado: {plan.estimatedCost.agentSteps ?? "—"} etapas</span>
          </>
        )}
        {!policy.allowed && plan.status === "supported" && <p className="text-[11px] text-muted-foreground">Nota: {policy.reason}</p>}
      </div>
      {error && <p className="mt-2 flex items-center gap-2 text-[12px] text-destructive"><CircleAlert className="size-3.5 shrink-0" /> {error}</p>}
    </div>
  )
}

/* ETAPAS REAIS — quando o objeto em Foco é uma Execução de Agente, suas
 * etapas reais (WorkflowStep) aparecem como apêndice do próprio Foco —
 * nunca uma caixa "Agentes em ação" independente e sempre visível. */
function RunStagesStrip({ runId }: { runId: string }) {
  const [steps, setSteps] = useState<WorkflowStep[] | null>(null)

  useEffect(() => {
    setSteps(null)
    fetch(`/api/agent-runs/${runId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setSteps(body?.steps ?? []))
      .catch(() => setSteps([]))
  }, [runId])

  const stages: Stage[] = (steps ?? []).map((s) => ({ label: translateStep(s.step), status: s.status, detail: s.error ?? undefined }))

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Etapas reais</p>
      <div className="mt-2">
        {steps == null ? <LoadingState label="Carregando etapas reais…" /> : stages.length === 0 ? <p className="text-[12px] text-muted-foreground">Nenhuma etapa real registrada ainda para esta execução.</p> : <StageGrid stages={stages} />}
      </div>
    </div>
  )
}

function EmptyFocus() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 p-8 text-center">
      <p className="text-[13px] text-muted-foreground">Nada em foco — ainda não há objetos reais suficientes neste projeto.</p>
    </div>
  )
}

/** O sujeito real de um TimelineEntry — Decisão (subjectType/subjectId),
 * Sinal (entityId), Ação (agentRunId) — aberto no mesmo Foco, nunca uma
 * navegação separada. `null` quando o item não tem sujeito conhecido
 * (ex. um Outcome real) — a linha renderiza como texto simples, nunca
 * um clique morto. */
function signalTarget(entry: TimelineEntry): InspectableRef | null {
  if (entry.type === "decision" && typeof entry.detail.subjectType === "string" && typeof entry.detail.subjectId === "string" && INSPECTABLE.has(entry.detail.subjectType)) {
    return { type: entry.detail.subjectType as ObjectType, id: entry.detail.subjectId }
  }
  if (entry.type === "decision") return { type: "decision", id: entry.id }
  if (entry.type === "signal" && typeof entry.detail.entityId === "string") return { type: "entity", id: entry.detail.entityId }
  if (entry.type === "observation") return { type: "observation", id: entry.id }
  if (entry.type === "action" && typeof entry.detail.agentRunId === "string") return { type: "agent_run", id: entry.detail.agentRunId }
  return null
}

interface FeedEntry {
  key: string
  item: FeedRowItem
  target: InspectableRef | null
}

export function MissionControl() {
  const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null)
  const [nextAction, setNextAction] = useState<NextAction | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [activeRuns, setActiveRuns] = useState<WorkflowRun[]>([])
  const [topOpportunity, setTopOpportunity] = useState<Opportunity | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const inspector = useObjectInspector()

  async function load() {
    try {
      const missionRes = await fetch("/api/v1/intelligence/mission")
      if (!missionRes.ok) throw new Error((await missionRes.json().catch(() => null))?.error ?? "Não foi possível carregar o Mission Control.")
      const missionBody = await missionRes.json()
      setSnapshot(missionBody.snapshot)
      setProjectId(missionBody.projectId)

      const [nextRes, timelineRes, oppRes, ...runResList] = await Promise.all([
        fetch("/api/v1/intelligence/next-action"),
        fetch(`/api/v1/intelligence/timeline?projectId=${missionBody.projectId}&limit=12`),
        fetch("/api/opportunities"),
        ...ACTIVE_RUN_STATUSES.map((s) => fetch(`/api/v1/workflows?status=${s}`)),
      ])
      if (nextRes.ok) setNextAction((await nextRes.json()).nextAction)
      if (timelineRes.ok) setTimeline((await timelineRes.json()).entries)
      if (oppRes.ok) {
        const opps: Opportunity[] = (await oppRes.json()).opportunities
        setTopOpportunity([...opps].sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1))[0] ?? null)
      }
      const runLists = await Promise.all(runResList.map((r) => (r.ok ? r.json() : { workflows: [] })))
      setActiveRuns(runLists.flatMap((b) => b.workflows as WorkflowRun[]))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o Mission Control.")
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  /** O objeto de maior prioridade real vira o Foco padrão da página —
   * nunca uma tela neutra de resumo (docs/mission-control-ux-v2.md
   * §A/E). Roda uma única vez, assim que os dois candidatos reais
   * (decisão pendente, oportunidade de maior score) estiverem
   * resolvidos — depois disso, a navegação do usuário é quem manda. */
  function resolveDefaultRef(): InspectableRef | null {
    if (nextAction && nextAction.decision.subjectId != null && INSPECTABLE.has(nextAction.decision.subjectType)) {
      return { type: nextAction.decision.subjectType as ObjectType, id: nextAction.decision.subjectId }
    }
    if (topOpportunity) return { type: "opportunity", id: topOpportunity.id }
    return null
  }

  useEffect(() => {
    if (!loaded || inspector.stack.length > 0) return
    const ref = resolveDefaultRef()
    if (ref) inspector.open(ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, nextAction, topOpportunity])

  function resetToDefault() {
    const ref = resolveDefaultRef()
    if (ref) inspector.open(ref)
    else inspector.close()
  }

  const feedEntries: FeedEntry[] = useMemo(() => {
    const fromTimeline: FeedEntry[] = timeline.map((e) => ({ key: `${e.type}:${e.id}`, item: { key: `${e.type}:${e.id}`, type: e.type, summary: e.summary, at: e.at }, target: signalTarget(e) }))
    const fromRuns: FeedEntry[] = activeRuns.map((r) => ({
      key: `run:${r.id}`,
      item: { key: `run:${r.id}`, type: "run", summary: `${translatePipeline(r.pipeline)} · ${translateStatus(r.status)}`, at: r.startedAt ?? r.createdAt },
      target: { type: "agent_run", id: r.id },
    }))
    return [...fromTimeline, ...fromRuns].sort((a, b) => b.item.at - a.item.at)
  }, [timeline, activeRuns])

  const currentRef = inspector.stack[inspector.stack.length - 1] ?? null
  const showDecisionStrip = !!(nextAction && currentRef && nextAction.decision.subjectType === currentRef.type && nextAction.decision.subjectId === currentRef.id)
  const showRunStrip = currentRef?.type === "agent_run"

  const pendingExtra = useMemo(() => (snapshot ? Math.max(0, snapshot.pendingDecisionCount - (showDecisionStrip ? 1 : 0)) : 0), [snapshot, showDecisionStrip])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* BARRA DE CONTEXTO */}
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
            {/* FOCO + O QUE ESTÁ ACONTECENDO — as duas únicas zonas reais
             * da página (docs/mission-control-ux-v2.md §G). O Foco NUNCA
             * tem altura fixa — é majoritariamente texto real (Propriedades/
             * Relacionamentos/Evidências/Histórico), e uma altura fixa
             * o esmagava quando um apêndice (Decisão pendente) crescia
             * em telas estreitas, cortando o próprio conteúdo do objeto.
             * O Feed sim tem um teto real (uma lista pode crescer sem
             * limite) — rola por dentro sem empurrar a página. */}
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* FOCO */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card sm:flex-1">
                {currentRef ? (
                  <ObjectInspector variant="docked" stack={inspector.stack} setStack={inspector.setStack} onClose={resetToDefault} closeLabel="Voltar ao foco padrão" />
                ) : (
                  <EmptyFocus />
                )}
                {showDecisionStrip && nextAction && <DecisionStrip nextAction={nextAction} onActed={() => void load()} />}
                {showRunStrip && currentRef && <RunStagesStrip runId={currentRef.id} />}
              </div>

              {/* O QUE ESTÁ ACONTECENDO */}
              <div className="flex max-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card sm:max-h-[680px] sm:w-[380px] sm:shrink-0">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">O que está acontecendo</p>
                  <a href="/intelligence/timeline" className="text-[11px] text-muted-foreground hover:text-foreground">Ver tudo →</a>
                </div>
                {feedEntries.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">Nenhum evento real registrado ainda para este projeto.</p>
                ) : (
                  <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
                    {feedEntries.map((entry) => (
                      <li key={entry.key}>
                        <SignalRow item={entry.item} onClick={entry.target ? () => inspector.open(entry.target!) : undefined} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {(pendingExtra > 0 || snapshot.blockedActionCount > 0) && (
              <p className="mt-3 text-[12px] text-muted-foreground">
                {pendingExtra > 0 && <>{pendingExtra} outra{pendingExtra === 1 ? "" : "s"} decisão{pendingExtra === 1 ? "" : "ões"} real{pendingExtra === 1 ? "" : "is"} pendente{pendingExtra === 1 ? "" : "s"}. </>}
                {snapshot.blockedActionCount > 0 && <>{snapshot.blockedActionCount} ação{snapshot.blockedActionCount === 1 ? "" : "ões"} bloqueada{snapshot.blockedActionCount === 1 ? "" : "s"} no momento. </>}
                <a href="/intelligence/decisions" className="text-primary hover:underline">Abrir Central de Decisões →</a>
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}

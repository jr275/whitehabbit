/* ================================================================== *
 * pt-BR PRESENTATION VOCABULARY (Fase 2 — docs/fase2-modelo-produto.md)
 * — the one shared translation surface every ontology UI component
 * pulls from, so a status/relation/signal never gets translated twice,
 * differently, in two places. Internal identifiers (table/column names,
 * enum values in code, API payload keys) are never touched — only what
 * a human reads. Every function here is a pure, total function: an
 * identifier this dictionary doesn't recognize still gets a readable
 * pt-BR-shaped fallback (underscores stripped, capitalized) rather than
 * a raw SCREAMING_SNAKE_CASE string — never left untranslated by
 * omission.
 * ================================================================== */

import type { ObjectType } from "./object-resolver"

/** Exported for the rare caller with a real identifier this dictionary
 * doesn't cover yet (e.g. a WorkflowStep's own `step` name) — still
 * needs a readable pt-BR-shaped fallback, never a raw token verbatim. */
export function humanize(raw: string): string {
  return raw
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^\p{L}/u, (c) => c.toUpperCase())
}

export const OBJECT_TYPE_LABEL_PT: Record<ObjectType, string> = {
  entity: "Entidade",
  opportunity: "Oportunidade",
  page: "Página",
  decision: "Decisão",
  agent_run: "Execução",
  observation: "Observação",
}

/** Types that appear as graph-node/relationship targets but have no
 * Object Inspector resolver yet — still need a real pt-BR label. */
const EXTRA_TYPE_LABEL_PT: Record<string, string> = {
  market: "Mercado",
  role: "Papel",
  intent: "Intenção",
  query: "Consulta",
  trend: "Tendência",
  signal: "Sinal",
  worker: "Agente configurável",
}

export function translateObjectType(type: string): string {
  return OBJECT_TYPE_LABEL_PT[type as ObjectType] ?? EXTRA_TYPE_LABEL_PT[type] ?? humanize(type)
}

/* Status — every closed status union in this codebase reduces to the
 * same five real state buckets (design-system-v4.md §5); this map only
 * supplies the pt-BR label for the raw value, tone stays a separate,
 * unchanged concern (components/ontology/object-badge.tsx). */
const STATUS_LABEL_PT: Record<string, string> = {
  discovered: "Descoberto",
  pending: "Pendente",
  queued: "Na fila",
  qualified: "Qualificado",
  approved: "Aprovado",
  generating: "Gerando",
  running: "Em execução",
  crawling: "Rastreando",
  discovering: "Descobrindo",
  analyzing: "Analisando",
  crawled: "Rastreado",
  waiting: "Aguardando",
  waiting_approval: "Aguardando aprovação",
  retrying: "Repetindo",
  ready: "Pronto para revisão",
  paused: "Pausado",
  published: "Publicado",
  succeeded: "Concluído com sucesso",
  completed: "Concluído",
  monitoring: "Monitorando",
  quality_rejected: "Rejeitado por qualidade",
  failed: "Falhou",
  blocked: "Bloqueado",
  cancelled: "Cancelado",
  rejected: "Rejeitado",
  stale: "Desatualizado",
  merged: "Mesclado",
  executed: "Executado",
  expired: "Expirado",
  skipped: "Ignorada",
  timed_out: "Tempo esgotado",
}

export function translateStatus(status: string | null): string {
  if (!status) return "—"
  return STATUS_LABEL_PT[status] ?? humanize(status)
}

/* A real IntelligenceAction's status (queued/running/succeeded/failed/
 * cancelled/blocked), agreed in the feminine to match "a Ação" — never
 * the masculine default STATUS_LABEL_PT gives a noun like "Página" or
 * "a Ação" a machine-translated-sounding mismatch (e.g. "Ação
 * concluído" instead of "Ação concluída"). */
const ACTION_STATUS_LABEL_PT_FEM: Record<string, string> = {
  queued: "na fila",
  running: "em execução",
  succeeded: "concluída com sucesso",
  failed: "falhou",
  cancelled: "cancelada",
  blocked: "bloqueada",
}

export function translateActionStatusFem(status: string): string {
  return ACTION_STATUS_LABEL_PT_FEM[status] ?? humanize(status).toLowerCase()
}

/* Relationships — the raw `relation` identifier as persisted (e.g.
 * "TARGETS_ROLE", "derived_from") never carries a natural pt-BR reading
 * on its own; this is display-only, the identifier itself is unchanged. */
const RELATION_LABEL_PT: Record<string, string> = {
  targets_role: "direciona-se a",
  TARGETS_ROLE: "direciona-se a",
  answers_intent: "responde a",
  ANSWERS_INTENT: "responde a",
  derived_from: "originado de",
  targets: "direciona-se a",
  targets_entity: "direciona-se a",
  produced: "produziu",
  measures: "mede",
  supports: "sustenta",
  materializes: "materializa-se em",
  operates_on: "opera sobre",
}

export function translateRelation(relation: string): string {
  return RELATION_LABEL_PT[relation] ?? RELATION_LABEL_PT[relation.toLowerCase()] ?? humanize(relation)
}

/* Decision actions — the 16 real DecisionAction values. */
const ACTION_LABEL_PT: Record<string, string> = {
  CREATE_PAGE: "Criar página",
  UPDATE_PAGE: "Atualizar página",
  MERGE_PAGES: "Mesclar páginas",
  REDIRECT_PAGE: "Redirecionar página",
  ADD_INTERNAL_LINKS: "Adicionar links internos",
  CREATE_HUB: "Criar hub",
  CREATE_DATASET: "Criar conjunto de dados",
  CREATE_CALCULATOR: "Criar calculadora",
  CREATE_COMPARISON: "Criar comparativo",
  CREATE_FAQ: "Criar FAQ",
  REFRESH_CONTENT: "Atualizar conteúdo",
  INVESTIGATE_ENTITY: "Investigar entidade",
  EXPAND_MARKET: "Expandir mercado",
  EXPAND_ROLE: "Expandir papel",
  MONITOR: "Monitorar",
  DO_NOTHING: "Não fazer nada",
}

export function translateAction(action: string): string {
  return ACTION_LABEL_PT[action] ?? humanize(action)
}

/* Signals — the real, unified SignalType taxonomy plus the earlier
 * Search Console detector taxonomy (lib/intelligence/signals.ts). */
const SIGNAL_LABEL_PT: Record<string, string> = {
  search_impression_spike: "Pico de impressões de busca",
  search_click_spike: "Pico de cliques de busca",
  ctr_anomaly: "Anomalia de CTR",
  position_improvement: "Melhora de posição",
  position_decline: "Queda de posição",
  query_emergence: "Consulta emergente",
  query_decay: "Consulta em declínio",
  page_decay: "Página em declínio",
  query_page_mismatch: "Consulta desalinhada da página",
  high_impression_low_ctr: "Muitas impressões, CTR baixo",
  high_ctr_low_position: "CTR alto, posição baixa",
  stale_data: "Dado desatualizado",
  competitor_change: "Mudança de concorrente",
  manual: "Sinal manual",
  SEARCH_DEMAND_INCREASED: "Demanda de busca aumentou",
  QUERY_EMERGING: "Consulta emergente",
  QUERY_DECLINING: "Consulta em declínio",
  PAGE_TRAFFIC_DECLINED: "Tráfego da página caiu",
  PAGE_CTR_DECLINED: "CTR da página caiu",
  ENTITY_GAP: "Lacuna de entidade",
  ENTITY_RELATIONSHIP_GAP: "Lacuna de relacionamento",
  CONTENT_GAP: "Lacuna de conteúdo",
  COMPETITOR_GAIN: "Ganho de concorrente",
  NEW_MARKET_SIGNAL: "Novo sinal de mercado",
  NEW_ROLE_SIGNAL: "Novo sinal de papel",
  TREND_ACCELERATION: "Aceleração de tendência detectada",
  CONTENT_DECAY: "Conteúdo em declínio",
  AI_CITATION_GAIN: "Ganho de citação em IA",
  AI_CITATION_LOSS: "Perda de citação em IA",
  INDEXATION_CHANGE: "Mudança de indexação",
  INFORMATION_GAIN_GAP: "Lacuna de ganho de informação",
  INTERNAL_LINK_GAP: "Lacuna de link interno",
}

export function translateSignalType(type: string): string {
  return SIGNAL_LABEL_PT[type] ?? humanize(type)
}

/* Evidence source types (lib/intelligence/evidence.ts + knowledge repo). */
const SOURCE_LABEL_PT: Record<string, string> = {
  web_search: "Pesquisa na web",
  search_console: "Search Console",
  crawl: "Rastreamento",
  manual: "Entrada manual",
  ai_run: "Execução de IA",
}

export function translateSource(source: string): string {
  return SOURCE_LABEL_PT[source] ?? humanize(source)
}

const VERIFICATION_LABEL_PT: Record<string, string> = {
  verified: "verificado",
  unverified: "não verificado",
  conflicting: "conflitante",
  stale: "desatualizado",
}

export function translateVerification(status: string): string {
  return VERIFICATION_LABEL_PT[status] ?? humanize(status)
}

/* Timeline entry kind badges. */
export const TIMELINE_TYPE_LABEL_PT: Record<string, string> = {
  signal: "Sinal",
  observation: "Observação",
  decision: "Decisão",
  action: "Ação",
  outcome: "Resultado",
}

/* Agent-run pipeline stage names, used by both the Page Factory pipeline
 * (already real, Fase UX-3) and the Live Agent Graph's node path
 * (Fase 4 §5): Descoberta → Pesquisa → Entidade → Dados → Oportunidade →
 * Conteúdo → SEO → GEO → QA → Publicação. */
const PIPELINE_LABEL_PT: Record<string, string> = {
  website_discovery: "Descoberta do site",
  content_generation: "Geração de conteúdo",
  trend_analysis: "Análise de tendências",
  decision_execution: "Execução de decisão",
}

export function translatePipeline(pipeline: string): string {
  return PIPELINE_LABEL_PT[pipeline] ?? humanize(pipeline)
}

/* Real WorkflowStep names (lib/website-discovery/steps.ts,
 * lib/content-pipeline/steps.ts) — used by the Mission Control
 * StageGrid (RE/MAX Knowledge reference §1.10) to show a running
 * Agent Run's own real steps, never invented stage names. */
const STEP_LABEL_PT: Record<string, string> = {
  crawl: "Rastreamento",
  extract_entities: "Extração de entidades",
  build_profile: "Construção de perfil",
  discover_opportunities: "Descoberta de oportunidades",
  research: "Pesquisa",
  outline: "Esboço",
  draft: "Redação",
  information_gain_gate: "Verificação de ganho de informação",
  seo: "Otimização SEO",
  geo: "Otimização GEO",
  quality: "Verificação de qualidade",
  decide_publish: "Decisão de publicação",
}

export function translateStep(step: string): string {
  return STEP_LABEL_PT[step] ?? humanize(step)
}

/** Relative timestamp in pt-BR — "há 2 min", "há 3 h", "agora" — the one
 * shared relative-time formatter for Signal UI (Fase 3 §8). */
export function relativeTimePt(at: number): string {
  const diffMs = Date.now() - at
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 5) return "agora"
  if (diffSec < 60) return `há ${diffSec} s`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin} min`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `há ${diffHour} h`
  const diffDay = Math.round(diffHour / 24)
  if (diffDay < 30) return `há ${diffDay} d`
  return new Date(at).toLocaleDateString("pt-BR")
}

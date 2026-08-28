"use client"

/* ================================================================== *
 * FEED ROW — a linha do feed único "O que está acontecendo"
 * (docs/mission-control-ux-v2.md §G): ponto colorido por estado real +
 * texto pt-BR + timestamp relativo, uma linha densa. Genérico o
 * suficiente para representar qualquer evento real do sistema — um
 * TimelineEntry (sinal/observação/decisão/ação/resultado) ou uma
 * WorkflowRun ativa — sem duplicar este componente por tipo de evento.
 * ================================================================== */

import { relativeTimePt } from "@/lib/ontology/pt-br"

export type FeedRowType = "signal" | "observation" | "decision" | "action" | "outcome" | "run"

export interface FeedRowItem {
  key: string
  type: FeedRowType
  summary: string
  at: number
  /** Uma classe real `bg-*` (ex. `bg-grow`) — quando omitida, cai para
   * um padrão neutro por tipo, nunca uma cor de categoria arbitrária. */
  dotClassName?: string
}

const TYPE_LABEL_PT: Record<FeedRowType, string> = {
  signal: "Sinal",
  observation: "Observação",
  decision: "Decisão",
  action: "Ação",
  outcome: "Resultado",
  run: "Execução",
}

const DEFAULT_DOT: Record<FeedRowType, string> = {
  signal: "bg-primary",
  observation: "bg-primary",
  decision: "bg-primary",
  action: "bg-primary",
  outcome: "bg-grow",
  run: "bg-primary",
}

export function SignalRow({ item, onClick }: { item: FeedRowItem; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag onClick={onClick} className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${onClick ? "hover:bg-secondary/40" : ""}`}>
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.dotClassName ?? DEFAULT_DOT[item.type]}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] leading-relaxed text-foreground">{item.summary}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{TYPE_LABEL_PT[item.type]}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{relativeTimePt(item.at)}</span>
      </div>
    </Tag>
  )
}

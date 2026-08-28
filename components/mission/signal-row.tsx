"use client"

/* ================================================================== *
 * SIGNAL ROW (Fase 3 §8 — Signal UI) — o único componente real de
 * "linha de sinal" que a Fase 3 pede para unificar: ponto colorido
 * (cor de ESTADO, nunca de categoria) + rótulo em pt-BR + timestamp
 * relativo, denso, uma linha. Usado pelo feed "Sinais ativos" do
 * Mission Control sobre o mesmo `TimelineEntry` real já produzido por
 * `lib/intelligence/timeline.ts` — nenhum dado sintético.
 * ================================================================== */

import type { TimelineEntry } from "@/lib/intelligence/timeline"
import { TIMELINE_TYPE_LABEL_PT, relativeTimePt } from "@/lib/ontology/pt-br"
import { statusTone } from "@/components/ontology/object-badge"

function toneFor(entry: TimelineEntry): string {
  const status = typeof entry.detail.status === "string" ? entry.detail.status : null
  if (status) return statusTone(status).className.replace("text-", "bg-")
  if (entry.type === "outcome") return "bg-grow"
  return "bg-primary"
}

export function SignalRow({ entry, onClick }: { entry: TimelineEntry; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${onClick ? "hover:bg-secondary/40" : ""}`}
    >
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${toneFor(entry)}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] leading-relaxed text-foreground">{entry.summary}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{TIMELINE_TYPE_LABEL_PT[entry.type] ?? entry.type}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{relativeTimePt(entry.at)}</span>
      </div>
    </Tag>
  )
}

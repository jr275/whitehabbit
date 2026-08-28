/* Object Type / Object Status badges — the shared visual vocabulary
 * design-system-v4.md §4-5 defines: a node's TYPE uses the categorical
 * --chart-* scale, a node's STATE always reduces to the same five
 * buckets (not-started/in-progress/needs-attention/succeeded/failed),
 * regardless of which real status union it came from. Never a sixth
 * ad hoc color introduced per feature. Labels are pt-BR (Fase 2) —
 * translateStatus/OBJECT_TYPE_LABEL_PT are the one shared dictionary
 * every surface reads from (lib/ontology/pt-br.ts), never a
 * per-component replaceAll(). */

import type { ObjectType } from "@/lib/ontology/object-resolver"
import { OBJECT_TYPE_LABEL_PT, translateStatus } from "@/lib/ontology/pt-br"
import { Network, Target, FileText, ListChecks, Cpu, Sparkles, type LucideIcon } from "lucide-react"

export const OBJECT_TYPE_META: Record<ObjectType, { label: string; icon: LucideIcon; chart: string }> = {
  entity: { label: OBJECT_TYPE_LABEL_PT.entity, icon: Network, chart: "text-chart-1" },
  opportunity: { label: OBJECT_TYPE_LABEL_PT.opportunity, icon: Target, chart: "text-chart-4" },
  page: { label: OBJECT_TYPE_LABEL_PT.page, icon: FileText, chart: "text-chart-2" },
  decision: { label: OBJECT_TYPE_LABEL_PT.decision, icon: ListChecks, chart: "text-chart-5" },
  agent_run: { label: OBJECT_TYPE_LABEL_PT.agent_run, icon: Cpu, chart: "text-chart-3" },
  observation: { label: OBJECT_TYPE_LABEL_PT.observation, icon: Sparkles, chart: "text-chart-5" },
}

export function ObjectTypeBadge({ type, className = "" }: { type: ObjectType; className?: string }) {
  const meta = OBJECT_TYPE_META[type]
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] ${meta.chart} ${className}`}>
      <Icon className="size-3 shrink-0" />
      {meta.label}
    </span>
  )
}

/* The five real state buckets every closed status union in this
 * codebase reduces to, per design-system-v4.md §5 — never a status
 * string rendered in a color this map doesn't cover. */
const NOT_STARTED = new Set(["discovered", "pending", "queued", null])
const IN_PROGRESS = new Set(["qualified", "approved", "generating", "running", "crawling", "discovering", "analyzing", "crawled", "waiting", "retrying"])
const NEEDS_ATTENTION = new Set(["ready", "waiting_approval", "paused"])
const SUCCEEDED = new Set(["published", "succeeded", "completed", "monitoring"])
const FAILED = new Set(["quality_rejected", "failed", "blocked", "cancelled", "rejected", "stale", "merged"])

export function statusTone(status: string | null): { label: string; className: string } {
  const label = translateStatus(status)
  if (status && SUCCEEDED.has(status)) return { label, className: "text-grow" }
  if (status && FAILED.has(status)) return { label, className: "text-destructive" }
  if (status && NEEDS_ATTENTION.has(status)) return { label, className: "text-warn" }
  if (status && IN_PROGRESS.has(status)) return { label, className: "text-primary" }
  return { label, className: "text-muted-foreground" }
}

export function ObjectStatusBadge({ status, className = "" }: { status: string | null; className?: string }) {
  const tone = statusTone(status)
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.1em] ${tone.className} ${className}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${tone.className.replace("text-", "bg-")}`} />
      {tone.label}
    </span>
  )
}

/* Object Type / Object Status badges — the shared visual vocabulary
 * design-system-v4.md §4-5 defines: a node's TYPE uses the categorical
 * --chart-* scale, a node's STATE always reduces to the same five
 * buckets (not-started/in-progress/needs-attention/succeeded/failed),
 * regardless of which real status union it came from. Never a sixth
 * ad hoc color introduced per feature. */

import type { ObjectType } from "@/lib/ontology/object-resolver"
import { Network, Target, FileText, ListChecks, Cpu, Sparkles, type LucideIcon } from "lucide-react"

export const OBJECT_TYPE_META: Record<ObjectType, { label: string; icon: LucideIcon; chart: string }> = {
  entity: { label: "Entity", icon: Network, chart: "text-chart-1" },
  opportunity: { label: "Opportunity", icon: Target, chart: "text-chart-4" },
  page: { label: "Page", icon: FileText, chart: "text-chart-2" },
  decision: { label: "Decision", icon: ListChecks, chart: "text-chart-5" },
  agent_run: { label: "Agent run", icon: Cpu, chart: "text-chart-3" },
  observation: { label: "Observation", icon: Sparkles, chart: "text-chart-5" },
}

export function ObjectTypeBadge({ type }: { type: ObjectType }) {
  const meta = OBJECT_TYPE_META[type]
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] ${meta.chart}`}>
      <Icon className="size-3" />
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
  if (status && SUCCEEDED.has(status)) return { label: status.replaceAll("_", " "), className: "text-grow" }
  if (status && FAILED.has(status)) return { label: status.replaceAll("_", " "), className: "text-destructive" }
  if (status && NEEDS_ATTENTION.has(status)) return { label: status.replaceAll("_", " "), className: "text-warn" }
  if (status && IN_PROGRESS.has(status)) return { label: status.replaceAll("_", " "), className: "text-primary" }
  return { label: status ? status.replaceAll("_", " ") : "—", className: "text-muted-foreground" }
}

export function ObjectStatusBadge({ status }: { status: string | null }) {
  const tone = statusTone(status)
  return <span className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] ${tone.className}`}><span className={`size-1.5 rounded-full ${tone.className.replace("text-", "bg-")}`} />{tone.label}</span>
}

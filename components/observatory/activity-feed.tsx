"use client"

/* Section 4: real activity, built only from WorkerEvent rows the
 * runtime actually persisted (GET /api/observatory/activity — see
 * lib/db/repo.ts's listRecentActivity, which filters to a curated
 * "meaningful" subset, not the full low-level log). This is a
 * DIFFERENT component from components/workforce/activity-feed.tsx,
 * which renders the demo store's fabricated ActivityEvent shape —
 * that one is untouched; Observatory no longer uses it. */

import Link from "next/link"
import type { ActivityItem } from "./types"

const TYPE_LABEL: Record<string, string> = {
  task_started: "Task started",
  stage_started: "Stage started",
  tool_called: "Tool invoked",
  approval_required: "Approval requested",
  approval_approved: "Approval granted",
  approval_rejected: "Approval rejected",
  output_created: "Output created",
  task_completed: "Execution completed",
  task_failed: "Execution failed",
  task_blocked: "Execution blocked",
}

const TYPE_DOT: Record<string, string> = {
  task_completed: "bg-grow",
  output_created: "bg-grow",
  approval_approved: "bg-grow",
  task_failed: "bg-destructive",
  approval_rejected: "bg-destructive",
  task_blocked: "bg-warn",
  approval_required: "bg-warn",
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

function describe(item: ActivityItem): string {
  const p = item.payload as { label?: string; stage?: string; action?: string; toolName?: string; actionLabel?: string; reason?: string }
  if (item.type === "stage_started" && (p.label || p.stage)) return p.label ?? p.stage!
  if (item.type === "tool_called" && p.toolName) return p.toolName
  if ((item.type === "approval_required" || item.type === "approval_approved" || item.type === "approval_rejected") && (p.actionLabel || p.reason)) return p.actionLabel ?? p.reason!
  return TYPE_LABEL[item.type] ?? item.type
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-[12.5px] text-muted-foreground">No activity yet.</p>
  }

  return (
    <div className="mt-3 flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {items.map((item) => (
        <Link key={item.id} href={`/outputs?execution=${encodeURIComponent(item.executionId)}`} className="flex items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-secondary/30">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[item.type] ?? "bg-muted-foreground/50"}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] text-foreground">
              <span className="font-medium">{item.workerName}</span> · {TYPE_LABEL[item.type] ?? item.type}
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground">{describe(item)}</p>
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{timeAgo(item.timestamp)}</span>
        </Link>
      ))}
    </div>
  )
}

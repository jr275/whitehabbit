"use client"

/* Same EXECUTION_STATUS_META/tone convention output-table.tsx already
 * uses for the real Outputs Hub — Observatory shows the same status
 * vocabulary, not a second one. */

import { EXECUTION_STATUS_META, type WorkerExecution } from "@/lib/workforce/model"

export function StatusPill({ status }: { status: WorkerExecution["status"] }) {
  const meta = EXECUTION_STATUS_META[status]
  const cls = meta.tone === "good" ? "text-grow bg-grow/10" : meta.tone === "info" ? "text-primary bg-primary/10" : meta.tone === "warn" ? "text-warn bg-warn/10" : meta.tone === "bad" ? "text-destructive bg-destructive/10" : "text-muted-foreground bg-secondary"
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{meta.label}</span>
}

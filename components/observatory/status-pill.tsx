"use client"

/* Same EXECUTION_STATUS_META/tone convention output-table.tsx already
 * uses for the real Outputs Hub — Observatory shows the same status
 * vocabulary, not a second one. */

import { TonePill } from "@/components/shared/tone-pill"
import { EXECUTION_STATUS_META, type WorkerExecution } from "@/lib/workforce/model"

export function StatusPill({ status }: { status: WorkerExecution["status"] }) {
  const meta = EXECUTION_STATUS_META[status]
  return <TonePill label={meta.label} tone={meta.tone} />
}

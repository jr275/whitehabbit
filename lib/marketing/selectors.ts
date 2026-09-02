/* ================================================================== *
 * MARKETING SELECTORS — pure projections over the real ledger, the
 * same category as lib/workforce/selectors.ts. Nothing here derives a
 * new number; every value already lives in a real WorkerOutput,
 * MetricRecord, or WorkerExecution the runtime already wrote.
 * ================================================================== */

import type { CreativeConceptsPayload, IntelligenceReportPayload } from "./model"
import type { MetricRecord, WorkerExecution, WorkerOutput } from "@/lib/workforce/model"

export function latestOutputOfType(outputs: WorkerOutput[], workerId: string, type: string): WorkerOutput | undefined {
  return outputs
    .filter((o) => o.workerId === workerId && o.type === type && o.status === "completed")
    .sort((a, b) => b.createdAt - a.createdAt)[0]
}

export function latestIntelligenceReport(outputs: WorkerOutput[], workerId: string): { output: WorkerOutput; payload: IntelligenceReportPayload } | undefined {
  const output = latestOutputOfType(outputs, workerId, "intelligence_report")
  if (!output?.structured) return undefined
  return { output, payload: output.structured as IntelligenceReportPayload }
}

export function latestCreativeConcepts(outputs: WorkerOutput[], workerId: string): { output: WorkerOutput; payload: CreativeConceptsPayload } | undefined {
  const output = latestOutputOfType(outputs, workerId, "creative_concepts")
  if (!output?.structured) return undefined
  return { output, payload: output.structured as CreativeConceptsPayload }
}

export interface WorldRightNowStat {
  key: string
  label: string
  value: number
  state: "real" | "demo" | "not_connected"
}

/** "TODAY" strip (section 16) — real counts only, split real vs demo
 * by the same execution_mode rule the Business Impact header already
 * uses (never summed together). A key with zero rows is omitted. */
export function worldRightNow(workerId: string, metrics: MetricRecord[], executions: WorkerExecution[]): WorldRightNowStat[] {
  const modeById = new Map(executions.map((e) => [e.id, e.executionMode]))
  const defs: { key: string; label: string }[] = [
    { key: "signals_detected", label: "Signals detected" },
    { key: "opportunities_scored", label: "Opportunities scored" },
    { key: "creative_concepts_generated", label: "Creative concepts generated" },
  ]
  const out: WorldRightNowStat[] = []
  for (const def of defs) {
    const rows = metrics.filter((m) => m.workerId === workerId && m.key === def.key)
    if (rows.length === 0) continue
    const real = rows.filter((m) => !(m.executionId && modeById.get(m.executionId) === "development"))
    const demo = rows.filter((m) => m.executionId && modeById.get(m.executionId) === "development")
    if (real.length > 0) out.push({ key: def.key, label: def.label, value: real.reduce((s, m) => s + m.value, 0), state: "real" })
    else out.push({ key: def.key, label: def.label, value: demo.reduce((s, m) => s + m.value, 0), state: "demo" })
  }
  return out
}

"use client"

/* ------------------------------------------------------------------ *
 * OBSERVABILITY — sections 15-19. Agent/Skill/Model/Tool scorecards
 * and Agent Health, computed only from real persisted executions/
 * outputs/events already in the store. A brand-new installation shows
 * 0 executions, "—" success rate, $0 cost — never fabricated activity.
 * ------------------------------------------------------------------ */

import { Activity } from "lucide-react"
import { agentScorecard, computeAgentHealth, modelScorecards, skillScorecards, toolScorecards, type Scorecard } from "@/lib/observability/scorecards"
import type { WorkerEvent, WorkerExecution, WorkerOutput, WorkerTask } from "@/lib/workforce/model"

const HEALTH_META = {
  healthy: { label: "Healthy", cls: "text-grow bg-grow/10 border-grow/30" },
  degraded: { label: "Degraded", cls: "text-warn bg-warn/10 border-warn/30" },
  failing: { label: "Failing", cls: "text-destructive bg-destructive/10 border-destructive/30" },
  no_data: { label: "No data", cls: "text-muted-foreground bg-secondary/50 border-border" },
} as const

export function ObservabilityPanel({
  workerId,
  tasks,
  executions,
  outputs,
  events,
}: {
  workerId: string
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
  events: WorkerEvent[]
}) {
  const agent = agentScorecard(workerId, executions, outputs)
  const health = computeAgentHealth(agent)
  const skills = skillScorecards(workerId, tasks, executions, outputs)
  const models = modelScorecards(workerId, executions, outputs)
  const tools = toolScorecards(workerId, events)

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Observability</h2>
        <span className={`ml-auto rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${HEALTH_META[health].cls}`}>{HEALTH_META[health].label}</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Agent scorecard</p>
        <ScorecardGrid scorecard={agent} />
      </div>

      {skills.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">By skill</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {skills.map((s) => (
              <div key={s.key} className="rounded-lg border border-border bg-card p-3">
                <p className="text-[12px] font-medium text-foreground">{s.label}</p>
                <ScorecardGrid scorecard={s.scorecard} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {models.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">By model</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {models.map((m) => (
              <div key={m.key} className="rounded-lg border border-border bg-card p-3">
                <p className="font-mono text-[11.5px] font-medium text-foreground">{m.label}</p>
                <ScorecardGrid scorecard={m.scorecard} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {tools.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">By tool</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {tools.map((t) => (
              <div key={t.toolId} className="rounded-lg border border-border bg-card p-3">
                <p className="font-mono text-[11px] font-medium text-foreground">{t.toolId.replace(/^tool_/, "")}</p>
                <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                  {t.calls} calls · {t.successRate != null ? `${t.successRate}%` : "—"} success
                  {t.p95LatencyMs != null && ` · p95 ${t.p95LatencyMs}ms`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {agent.failureReasons.length > 0 && (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 p-3">
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-warn">Failure reasons</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {agent.failureReasons.map((f) => (
              <li key={f.reason} className="flex items-center justify-between text-[11.5px] text-foreground">
                <span>{f.reason}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{f.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function ScorecardGrid({ scorecard, compact = false }: { scorecard: Scorecard; compact?: boolean }) {
  const items: { label: string; value: string }[] = [
    { label: "Executions", value: String(scorecard.executions) },
    { label: "Success rate", value: scorecard.successRate != null ? `${scorecard.successRate}%` : "—" },
    { label: "P95 latency", value: scorecard.p95LatencyMs != null ? `${(scorecard.p95LatencyMs / 1000).toFixed(1)}s` : "—" },
    { label: "AI cost", value: scorecard.aiCostUsd != null ? `$${scorecard.aiCostUsd.toFixed(4)}` : "—" },
    { label: "Cost/execution", value: scorecard.costPerExecution != null ? `$${scorecard.costPerExecution.toFixed(4)}` : "—" },
    { label: "Evaluation", value: scorecard.avgEvaluationScore != null ? `${scorecard.avgEvaluationScore}%` : "—" },
  ]
  return (
    <div className={`mt-2 grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
      {items.map((it) => (
        <div key={it.label}>
          <p className={`font-mono font-semibold tabular-nums text-foreground ${compact ? "text-[13px]" : "text-[16px]"}`}>{it.value}</p>
          <p className="text-[8.5px] text-muted-foreground">{it.label}</p>
        </div>
      ))}
    </div>
  )
}

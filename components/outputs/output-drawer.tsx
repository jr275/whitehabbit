"use client"

/* ------------------------------------------------------------------ *
 * Output drawer — resolves a filter (every output of a type, or one
 * specific execution) against the real ledger and shows either a list
 * or the one real detail behind it: status, quality breakdown, real
 * sources, and real execution metadata (duration, model, tokens,
 * cost). A blocked or failed execution has no output row — the drawer
 * shows the real reason instead of pretending one exists.
 * ------------------------------------------------------------------ */

import { ArrowLeft, Check, X } from "lucide-react"
import { useEffect, useState } from "react"
import { DevModeTag } from "@/components/outputs/output-table"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"
import { deriveBusinessOutcome } from "@/lib/workforce/business-outcome"
import { formatBusinessValue, metricsForOutput, provenanceForExecution } from "@/lib/workforce/business-results"
import { SKILL_CATALOG, TOOL_CATALOG } from "@/lib/workforce/catalog"
import type { MetricRecord, Worker, WorkerEvent, WorkerExecution, WorkerOutput, WorkerTask } from "@/lib/workforce/model"
import { EXECUTION_STATUS_META, OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { buildExecutionStages, isToday, timeOfDay } from "@/lib/workforce/selectors"

export type DrawerFilter = { kind: "type"; workerId: string; type: string; title: string } | { kind: "execution"; executionId: string }

const REASON_CODE_LABEL: Record<NonNullable<WorkerExecution["reasonCode"]>, string> = {
  missing_credential: "Missing credential",
  invalid_credential: "Invalid credential",
  provider_error: "Provider error",
  execution_error: "Execution error",
}

export function OutputDrawer({
  filter,
  workers,
  tasks,
  executions,
  outputs,
  metrics,
  events,
  onClose,
}: {
  filter: DrawerFilter
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
  metrics: MetricRecord[]
  events: WorkerEvent[]
  onClose: () => void
}) {
  const list =
    filter.kind === "type"
      ? outputs.filter((o) => o.workerId === filter.workerId && o.type === filter.type && isToday(o.createdAt))
      : outputs.filter((o) => o.executionId === filter.executionId)

  const singleExecution = filter.kind === "execution" ? executions.find((e) => e.id === filter.executionId) : undefined
  const singleTask = singleExecution ? tasks.find((t) => t.id === singleExecution.taskId) : undefined
  const worker = filter.kind === "type" ? workers.find((w) => w.id === filter.workerId) : workers.find((w) => w.id === singleExecution?.workerId)
  const title = filter.kind === "type" ? filter.title : (singleTask?.title ?? "Execution")

  const [selected, setSelected] = useState<WorkerOutput | null>(list.length === 1 ? list[0] : null)
  useEffect(() => {
    setSelected(list.length === 1 ? list[0] : null)
  }, [filter.kind === "type" ? `${filter.workerId}:${filter.type}` : filter.executionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const showBlockedDetail = filter.kind === "execution" && singleExecution && singleExecution.status !== "completed" && list.length === 0
  const activeOutput = selected
  const activeExecution = activeOutput ? executions.find((e) => e.id === activeOutput.executionId) : singleExecution
  const activeTask = activeOutput ? tasks.find((t) => t.id === activeOutput.taskId) : singleTask

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          {activeOutput && list.length > 1 && (
            <button onClick={() => setSelected(null)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{worker?.identity.name ?? "Outputs"}</p>
            <h2 className="truncate text-[15px] font-semibold text-foreground">{activeOutput ? (OUTPUT_TYPE_META[activeOutput.type]?.label ?? activeOutput.type) : title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="thin-scroll-light flex-1 overflow-y-auto">
          {showBlockedDetail && singleExecution ? (
            <BlockedDetail execution={singleExecution} task={singleTask} events={events} />
          ) : !activeOutput ? (
            <ul className="divide-y divide-border">
              {list.map((o) => (
                <li key={o.id}>
                  <button onClick={() => setSelected(o)} className="flex w-full flex-col items-start gap-1 px-5 py-3 text-left transition-colors hover:bg-secondary/50">
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">{o.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeOfDay(o.createdAt)}</span>
                    </div>
                    {o.qualityScore != null && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">Quality {o.qualityScore}%</span>}
                  </button>
                </li>
              ))}
              {list.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No outputs to show.</p>}
            </ul>
          ) : (
            <DetailView output={activeOutput} execution={activeExecution} task={activeTask} metrics={metrics} events={events} />
          )}
        </div>
      </div>
    </>
  )
}

function BlockedDetail({ execution, task, events }: { execution: WorkerExecution; task?: WorkerTask; events: WorkerEvent[] }) {
  const meta = EXECUTION_STATUS_META[execution.status]
  const stages = buildExecutionStages(execution, events)
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <div className="rounded-lg border border-warn/30 bg-warn/5 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-warn">{meta.label}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">{execution.blockedReason ?? "No reason recorded."}</p>
      </div>

      <div>
        <SectionLabel>Execution timeline — exactly how far it got</SectionLabel>
        <ExecutionTimeline stages={stages} />
      </div>

      <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
        <MetaRow k="Task" v={task?.title ?? "—"} />
        {execution.reasonCode && <MetaRow k="Reason" v={REASON_CODE_LABEL[execution.reasonCode]} />}
        <MetaRow k="Started" v={timeOfDay(execution.startedAt)} />
        {execution.completedAt && <MetaRow k="Ended" v={timeOfDay(execution.completedAt)} />}
      </dl>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        This is the real reason the task did not complete — nothing was substituted for a result.
      </p>
    </div>
  )
}

/** Real stage-by-stage progression — see buildExecutionStages(). A stage
 * the run never reached renders as a hollow, muted step, not a fake
 * checkmark; the stage that actually failed renders red with the real
 * reason. Durations shown are the same real numbers the live stream used. */
export function ExecutionTimeline({ stages, live = false }: { stages: ReturnType<typeof buildExecutionStages>; live?: boolean }) {
  // the real stage list is already ordered; while a run is actually in
  // progress (live), the first not-yet-reached stage is the one it's
  // currently on — a read of real, existing data, not a new status.
  const currentIdx = live ? stages.findIndex((s) => s.status === "pending") : -1
  return (
    <ol className="flex flex-col gap-0">
      {stages.map((s, i) => {
        const isCurrent = i === currentIdx
        return (
          <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0">
            {i < stages.length - 1 && <span className="absolute left-[9px] top-5 h-[calc(100%-0.5rem)] w-px bg-border" />}
            <span
              className={`z-10 mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
                s.status === "done"
                  ? "border-grow bg-grow/15 text-grow"
                  : s.status === "failed"
                    ? "border-destructive bg-destructive/15 text-destructive"
                    : isCurrent
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground/40"
              }`}
            >
              {s.status === "done" ? (
                <Check className="h-2.5 w-2.5" />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full bg-current ${isCurrent ? "animate-pulse" : ""}`} />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-px">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[12.5px] font-medium ${isCurrent ? "text-primary" : s.status === "pending" ? "text-muted-foreground/60" : "text-foreground"}`}>
                  {s.label}
                </span>
                {s.durationMs != null && <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">{s.durationMs}ms</span>}
              </div>
              {s.detail && <p className={`mt-0.5 text-[11px] leading-relaxed ${s.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{s.detail}</p>}
              {isCurrent && !s.detail && <p className="mt-0.5 text-[11px] text-primary">In progress</p>}
              {s.status === "pending" && !isCurrent && !s.detail && <p className="mt-0.5 text-[11px] italic text-muted-foreground/60">Not reached</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function DetailView({ output, execution, task, metrics, events }: { output: WorkerOutput; execution?: WorkerExecution; task?: WorkerTask; metrics: MetricRecord[]; events: WorkerEvent[] }) {
  const template = task ? SKILL_CATALOG.find((s) => s.id === task.skillId) : undefined
  const toolNames = template?.requiredTools.map((id) => TOOL_CATALOG.find((t) => t.id === id)?.name ?? id).join(", ")
  const isDev = execution?.executionMode === "development"
  const stages = execution ? buildExecutionStages(execution, events, output) : []
  const recordedMetrics = metricsForOutput(output, metrics)

  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-pretty text-[16px] font-semibold leading-snug text-foreground">{output.title}</h3>
          <ProvenanceBadge provenance={provenanceForExecution(execution)} />
          {isDev && <DevModeTag />}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Status">
            <span className={`font-mono text-[12px] ${output.status === "failed" ? "text-destructive" : "text-grow"}`}>{output.status === "failed" ? "Failed" : "Completed"}</span>
          </Field>
          <Field label="Quality">
            <span className="font-mono text-[13px] tabular-nums text-foreground">{output.qualityScore ?? "—"}%</span>
          </Field>
        </div>

        {/* the economics/telemetry of this run, at a glance — the same
         * real numbers the full Execution metadata section below has in
         * detail, promoted here so they're never buried past everything
         * else. */}
        <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg border border-border bg-secondary/30 p-2.5">
          <StatCell label="Model" value={execution?.model ?? "—"} />
          <StatCell label="Tokens" value={isDev ? "0 / 0" : execution?.inputTokens != null ? `${execution.inputTokens}/${execution.outputTokens ?? 0}` : "—"} />
          <StatCell label="Cost" value={isDev ? "$0 (dev)" : execution?.costUsd != null ? `$${execution.costUsd.toFixed(4)}` : "—"} />
          <StatCell label="Time" value={execution?.durationMs ? `${Math.round(execution.durationMs / 1000)}s` : "—"} />
        </div>
      </div>

      <div>
        <ResultLabel>Result</ResultLabel>
        <p className="whitespace-pre-line rounded-lg border border-border bg-card px-3.5 py-3 text-[13px] leading-relaxed text-foreground shadow-sm">{output.content}</p>
      </div>

      <BusinessOutcomePanel output={output} execution={execution} />

      <div>
        <SectionLabel>Business metrics recorded</SectionLabel>
        {recordedMetrics.length > 0 ? <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">{recordedMetrics.map((metric) => <MetaRow key={metric.id} k={metric.key.replaceAll("_", " ")} v={formatBusinessValue(metric.value, metric.unit ?? "")} />)}</dl> : <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[11.5px] text-muted-foreground">No business-impact metric was recorded for this output. Operational activity is not being presented as business impact.</p>}
      </div>

      <div>
        <SectionLabel>Decision trace</SectionLabel>
        <ol className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-[11.5px] text-foreground">
          <li><span className="text-muted-foreground">Input / Task · </span>{task?.title ?? "No task title recorded"}</li>
          <li><span className="text-muted-foreground">Skill · </span>{template?.name ?? task?.skillId ?? "Not recorded"}</li>
          <li><span className="text-muted-foreground">Evidence · </span>{output.sources?.length ? `${output.sources.length} source${output.sources.length === 1 ? "" : "s"}` : "No external sources recorded"}</li>
          <li><span className="text-muted-foreground">Recorded output · </span>{output.title}</li>
          <li><span className="text-muted-foreground">Business result · </span>{recordedMetrics.length ? `${recordedMetrics.length} metric${recordedMetrics.length === 1 ? "" : "s"} recorded` : "Not connected"}</li>
        </ol>
      </div>

      {output.evaluation && (
        <div>
          <SectionLabel>Evaluation — real, structural checks</SectionLabel>
          <div className="flex flex-col gap-2">
            {output.evaluation.breakdown.map((b) => (
              <div key={b.label} className="rounded-lg border border-border bg-card p-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-muted-foreground">{b.label}</span>
                  <span className="font-mono text-[12px] font-medium tabular-nums text-foreground">{b.score}</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, b.score)}%` }} />
                </div>
                <p className="mt-1 text-[10.5px] text-muted-foreground">{b.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {output.sources && output.sources.length > 0 && (
        <div>
          <SectionLabel>Real sources used ({output.sources.length})</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {output.sources.map((s, i) => (
              <li key={i} className="rounded-lg border border-border bg-card px-3 py-2">
                <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-[12px] font-medium text-primary hover:underline">
                  {s.title}
                </a>
                {s.snippet && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{s.snippet}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stages.length > 0 && (
        <div>
          <SectionLabel>Execution timeline</SectionLabel>
          <ExecutionTimeline stages={stages} />
        </div>
      )}

      {task && (
        <div>
          <SectionLabel>Task</SectionLabel>
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">{task.title}</p>
        </div>
      )}

      <details className="group rounded-lg border border-border bg-secondary/20">
        <summary className="cursor-pointer list-none px-3 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Technical execution details</summary>
        <dl className="flex flex-col divide-y divide-border border-t border-border">
          {isDev && <MetaRow k="Mode" v="Development simulation — no external LLM was called" />}
          <MetaRow k="Timestamp" v={new Date(output.createdAt).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })} />
          <MetaRow k="Duration" v={execution?.durationMs ? `${Math.round(execution.durationMs / 1000)}s` : "—"} />
          <MetaRow k="Model" v={execution?.model ?? "—"} />
          <MetaRow k="Tokens" v={isDev ? "0 in / 0 out (development)" : execution?.inputTokens != null ? `${execution.inputTokens} in / ${execution.outputTokens ?? 0} out` : "—"} />
          <MetaRow k="Cost" v={isDev ? "$0.0000 (development)" : execution?.costUsd != null ? `$${execution.costUsd.toFixed(4)}` : "—"} />
          <MetaRow k="Tools used" v={toolNames || "—"} />
        </dl>
      </details>
    </div>
  )
}

/** The plain-language business outcome derived from this output's own
 * real structured data (see lib/workforce/business-outcome.ts) — a
 * headline, the real evidence behind it, what was actually done, and
 * impact numbers split strictly into real (computed from this run) vs.
 * not yet connected. Renders nothing for output types with no deriver —
 * never a fabricated outcome for a type this function doesn't know. */
function BusinessOutcomePanel({ output, execution }: { output: WorkerOutput; execution?: WorkerExecution }) {
  const outcome = deriveBusinessOutcome(output, execution)
  if (!outcome) return null
  return (
    <div>
      <SectionLabel>Business outcome</SectionLabel>
      <div className="rounded-lg border border-border bg-card p-3.5 shadow-sm">
        <p className="text-[13px] font-medium leading-relaxed text-foreground">{outcome.headline}</p>

        {outcome.evidence.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {outcome.evidence.map((e, i) => (
              <li key={i} className="text-[11.5px] leading-relaxed text-muted-foreground">
                — {e}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {outcome.impact.map((m) => (
            <div key={m.label} className={`rounded-md border px-2.5 py-2 ${m.real ? "border-grow/25 bg-grow/5" : "border-dashed border-border bg-secondary/30"}`}>
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate text-[10px] text-muted-foreground">{m.label}</span>
                {!m.real && <span className="shrink-0 font-mono text-[8px] uppercase tracking-wide text-muted-foreground/70">Not connected</span>}
              </div>
              <div className={`mt-0.5 font-mono text-[13px] font-medium tabular-nums ${m.real ? "text-foreground" : "text-muted-foreground/50"}`}>{m.value}</div>
              {!m.real && m.connectHint && <p className="mt-0.5 text-[9.5px] leading-snug text-muted-foreground/70">{m.connectHint}</p>}
            </div>
          ))}
        </div>

        {outcome.actionsPerformed.length > 0 && (
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Done: </span>
            {outcome.actionsPerformed.join(" · ")}
          </p>
        )}

        <p className="mt-2 border-t border-border pt-2.5 text-[11.5px] text-muted-foreground">
          <span className="font-medium text-foreground">Next: </span>
          {outcome.nextRecommendedAction}
        </p>
      </div>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[12px] font-medium tabular-nums text-foreground">{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
}

/** The Result is the actual work product — one visual step louder than
 * the SectionLabel used for supporting telemetry (Evaluation, Sources,
 * Timeline, Task, Metadata), so it reads first without adding anything
 * that isn't already there. */
function ResultLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground">{children}</div>
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-[11.5px] text-muted-foreground">{k}</dt>
      <dd className="truncate text-right text-[11.5px] text-foreground">{v}</dd>
    </div>
  )
}

"use client"

/* ================================================================== *
 * WORKER CANVAS (center zone) — Phase UX-2 rebuild.
 *
 * Was a dark "capability cross" (Skills/Tools/Knowledge/Behavior
 * arranged spatially around a Worker avatar). Now a two-column
 * document on the --ref-* tokens Phase UX-1's Skill Card established
 * (app/globals.css, components/skills/skill-card.tsx) — the explicit
 * goal of this rebuild is to remove the seam between that card and
 * the surface it sat on. See docs/ux-reference-analysis.md for the
 * reference this follows and docs/ux-design-constitution.md for the
 * information hierarchy it's held to.
 *
 * PRIMARY column: Mission (+ Economic Objective) -> Skills -> Tools
 * -> Policies — the real worker-construction surface.
 * SECONDARY column: Readiness -> Autonomy -> Data Readiness -> Recent
 * Activity — persistent context, deliberately never visually dominant
 * over the primary column.
 *
 * Every "Configure" affordance routes to the real left-rail Build
 * step that already owns that field (components/studio/build-panel.tsx)
 * — this document is a read-and-navigate surface, not a second,
 * competing editing UI. Autonomy is the one exception: its level
 * selector is directly interactive here too, calling the same
 * workforceStore.setAutonomy() the left rail's Access step already
 * uses — the constitution asks for autonomy in both the context panel
 * and the configuration surface, not one or the other.
 *
 * Deliberately NOT in scope here (see the Phase UX-2 report): the
 * left Configure rail and right Live Outputs rail stay as they are —
 * still the app's dark register. That remaining seam is real and
 * named, not hidden; rebuilding those is a separately-scoped next
 * step, not silently attempted inside this file.
 * ================================================================== */

import { AlertTriangle, ArrowRight, Check, KeyRound, Loader2, ShieldAlert, Wallet, XCircle } from "lucide-react"
import type { StepKey } from "@/components/studio/build-panel"
import { SkillCard } from "@/components/skills/skill-card"
import {
  AUTONOMY_LEVEL_META,
  AUTONOMY_LEVEL_ORDER,
  autonomyLevelFor,
  FUTURE_CONNECTOR_CATEGORIES,
  TOOL_CATALOG,
} from "@/lib/workforce/catalog"
import { toolExecutionBoundary, TOOL_BOUNDARY_META, type Worker, type WorkerEvent, type WorkerExecution, type WorkerOutput, type WorkerTask, type WorkforceTool } from "@/lib/workforce/model"
import { buildExecutionStages, buildSkillCardView, computeReadiness, credentialBlockers, todaysTimeline } from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"
import type { ReactNode } from "react"

interface FinishedRunResult {
  icon: typeof KeyRound
  title: string
  detail: string
}

/** Translates a real, structured execution outcome into the exact copy
 * the UI shows — never a generic "something went wrong". */
function describeFinishedRun(worker: Worker, task: WorkerTask, execution: WorkerExecution): FinishedRunResult {
  if (execution.status === "blocked") {
    const blocker = credentialBlockers(worker).find((b) => b.skillId === task.skillId)
    return { icon: KeyRound, title: blocker?.title ?? "Credential required", detail: blocker?.detail ?? execution.blockedReason ?? "A required credential is not configured." }
  }
  if (execution.status === "pending_approval") {
    return { icon: ShieldAlert, title: "Waiting on human approval", detail: execution.blockedReason ?? "This action requires approval before it can run." }
  }
  switch (execution.reasonCode) {
    case "invalid_credential":
      return { icon: KeyRound, title: "The configured API key was rejected", detail: execution.blockedReason ?? "Check the credential and try again." }
    case "provider_error":
      return { icon: AlertTriangle, title: "A tool call failed", detail: execution.blockedReason ?? "The external service did not respond successfully." }
    default:
      return { icon: XCircle, title: "The run failed", detail: execution.blockedReason ?? "See the execution timeline in Outputs Hub for details." }
  }
}

export function WorkerCanvas({
  worker,
  tasks,
  executions,
  events,
  outputs,
  running,
  onNavigateToStep,
}: {
  worker: Worker
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  events: WorkerEvent[]
  outputs: WorkerOutput[]
  running: boolean
  activeStep: StepKey
  onNavigateToStep: (step: StepKey) => void
}) {
  const { metrics } = useWorkforce()
  const enabledSkills = worker.skills.filter((s) => s.enabled)
  const runningExecution = executions.find((e) => e.workerId === worker.id && e.status === "running")
  const runningSkillId = runningExecution ? tasks.find((t) => t.id === runningExecution.taskId)?.skillId : undefined
  const readiness = computeReadiness(worker)
  const recent = todaysTimeline([worker], executions, tasks, outputs).filter((t) => t.workerId === worker.id).slice(0, 6)
  const financialTool = worker.tools.find((t) => t.id === "tool_financial_data")

  const active = executions.filter((e) => e.workerId === worker.id && e.status === "running")
  const lastExecution = executions.filter((e) => e.workerId === worker.id && e.status !== "running").sort((a, b) => b.startedAt - a.startedAt)[0]
  const lastTask = lastExecution ? tasks.find((t) => t.id === lastExecution.taskId) : undefined
  const lastOutput = lastExecution ? outputs.find((o) => o.executionId === lastExecution.id) : undefined
  const lastResult =
    active.length === 0 && lastExecution && lastTask && (lastExecution.status === "blocked" || lastExecution.status === "failed" || lastExecution.status === "pending_approval")
      ? describeFinishedRun(worker, lastTask, lastExecution)
      : null
  const liveStages = runningExecution ? buildExecutionStages(runningExecution, events) : null

  return (
    <div className="thin-scroll-light h-full overflow-y-auto bg-ref-paper">
      <div className="@container mx-auto max-w-5xl px-5 py-8 @sm:px-8 @sm:py-10">
        <StatusBanner running={running} liveStagesCount={liveStages?.length ?? 0} lastResult={lastResult} lastCompleted={!lastResult && lastExecution?.status === "completed"} lastOutput={lastOutput} elapsedSeconds={active[0] ? Math.round((Date.now() - active[0].startedAt) / 1000) : undefined} />

        <div className="mt-8 flex flex-col gap-10 @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_20rem] @2xl:items-start @2xl:gap-10">
          {/* PRIMARY — the construction surface */}
          <div className="flex min-w-0 flex-col gap-10">
            <MissionSection worker={worker} onNavigateToStep={onNavigateToStep} />
            <DocSection
              eyebrow="Skills"
              hint="Capabilities this Worker uses to pursue its financial mission."
              action={<ConfigureLink onClick={() => onNavigateToStep("skills")} />}
            >
              {enabledSkills.length === 0 ? (
                <EmptyRow text="No skills enabled yet." actionLabel="Add a skill" onClick={() => onNavigateToStep("skills")} />
              ) : (
                <div className="flex flex-col gap-3">
                  {enabledSkills.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={buildSkillCardView(skill, worker, tasks, executions, outputs, metrics)}
                      executing={skill.id === runningSkillId}
                      onConfigure={() => onNavigateToStep("skills")}
                    />
                  ))}
                </div>
              )}
            </DocSection>
            <ToolsSection worker={worker} onNavigateToStep={onNavigateToStep} />
            <PoliciesSection worker={worker} onNavigateToStep={onNavigateToStep} />
          </div>

          {/* SECONDARY — persistent context, never visually dominant */}
          <div className="flex min-w-0 flex-col gap-6">
            <ReadinessPanel readiness={readiness} />
            <AutonomyPanel worker={worker} />
            <DataReadinessPanel financialTool={financialTool} />
            <ActivityPanel recent={recent} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---- status banner — what the old "execution zone" showed, kept:
 * running progress, the last real outcome, or nothing when idle. ---- */
function StatusBanner({
  running,
  liveStagesCount,
  lastResult,
  lastCompleted,
  lastOutput,
  elapsedSeconds,
}: {
  running: boolean
  liveStagesCount: number
  lastResult: FinishedRunResult | null
  lastCompleted: boolean
  lastOutput?: WorkerOutput
  elapsedSeconds?: number
}) {
  if (running && liveStagesCount > 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-[3px] border border-ref-accent/40 bg-ref-accent-soft px-4 py-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-ref-accent" aria-hidden />
        <p className="flex-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ref-accent">Running now</p>
        {elapsedSeconds != null && <span className="font-mono text-[11px] tabular-nums text-ref-ink-muted">{elapsedSeconds}s</span>}
      </div>
    )
  }
  if (lastResult) {
    return (
      <div className="flex items-start gap-2.5 rounded-[3px] border border-ref-warn/40 bg-ref-warn-soft px-4 py-3">
        <lastResult.icon className="mt-0.5 size-4 shrink-0 text-ref-warn" aria-hidden />
        <div>
          <p className="text-[13px] font-medium text-ref-ink">{lastResult.title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ref-ink-muted">{lastResult.detail}</p>
        </div>
      </div>
    )
  }
  if (lastCompleted) {
    return (
      <div className="flex items-center gap-2.5 rounded-[3px] border border-ref-hairline bg-ref-paper px-4 py-3">
        <Check className="size-4 shrink-0 text-ref-ink" aria-hidden />
        <p className="text-[12.5px] text-ref-ink">Last run completed{lastOutput?.qualityScore != null ? ` — quality ${lastOutput.qualityScore}%` : ""}.</p>
      </div>
    )
  }
  return null
}

/* ---- shared document primitives — same visual grammar as SkillCard ---- */

function DocSection({ eyebrow, hint, action, children }: { eyebrow: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ref-ink">{eyebrow}</h2>
          {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-ref-ink-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ConfigureLink({ onClick, label = "Configure" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-[2px] border border-ref-hairline px-2.5 py-1 font-sans text-[11px] text-ref-ink-muted transition-colors outline-offset-2 hover:border-ref-ink/30 hover:text-ref-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ref-accent)]"
    >
      {label}
    </button>
  )
}

function EmptyRow({ text, actionLabel, onClick }: { text: string; actionLabel: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[3px] border border-dashed border-ref-hairline px-4 py-4">
      <p className="text-[12.5px] italic text-ref-ink-muted">{text}</p>
      <ConfigureLink onClick={onClick} label={actionLabel} />
    </div>
  )
}

function PanelBox({ eyebrow, action, children }: { eyebrow: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[3px] border border-ref-hairline bg-ref-paper px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ref-ink-muted">{eyebrow}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/* ---- Mission + Economic Objective ---- */

function MissionSection({ worker, onNavigateToStep }: { worker: Worker; onNavigateToStep: (step: StepKey) => void }) {
  const obj = worker.economicObjective
  return (
    <DocSection eyebrow="Mission" action={<ConfigureLink onClick={() => onNavigateToStep("mission")} />}>
      {worker.mission.trim() ? (
        <p className="text-[14px] leading-relaxed text-ref-ink">{worker.mission}</p>
      ) : (
        <EmptyRow text="No mission defined yet." actionLabel="Define mission" onClick={() => onNavigateToStep("mission")} />
      )}

      <div className="mt-5 border-t border-ref-hairline pt-5">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ref-ink-muted">Economic objective</h3>
        {!obj || !obj.objective.trim() ? (
          <div className="mt-2">
            <EmptyRow text="Not defined yet — this Worker has no stated economic objective." actionLabel="Define objective" onClick={() => onNavigateToStep("mission")} />
          </div>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-3 @sm:grid-cols-2">
            <DocField term="Objective" value={obj.objective} />
            <DocField term="Target metric" value={obj.targetMetric || "Not set"} />
            {obj.targetValue && <DocField term="Target" value={obj.targetValue} />}
            {obj.targetPeriod && <DocField term="Period" value={obj.targetPeriod} />}
            <DocField term="Constraints" value={obj.constraints.length ? obj.constraints.join(", ") : "None stated"} />
            <DocField term="Risk tolerance" value={obj.riskTolerance[0].toUpperCase() + obj.riskTolerance.slice(1)} />
          </dl>
        )}
      </div>
    </DocSection>
  )
}

function DocField({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ref-ink-muted">{term}</dt>
      <dd className="mt-1 text-[12.5px] leading-snug text-ref-ink">{value}</dd>
    </div>
  )
}

/* ---- Tools ---- */

function ToolsSection({ worker, onNavigateToStep }: { worker: Worker; onNavigateToStep: (step: StepKey) => void }) {
  return (
    <DocSection eyebrow="Tools" hint="Real capabilities available to this Worker, not passive integrations." action={<ConfigureLink onClick={() => onNavigateToStep("tools")} />}>
      <div className="flex flex-col gap-3">
        {worker.tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} onConfigure={() => onNavigateToStep("tools")} />
        ))}
      </div>
    </DocSection>
  )
}

function ToolCard({ tool, onConfigure }: { tool: WorkforceTool; onConfigure: () => void }) {
  const template = TOOL_CATALOG.find((t) => t.id === tool.id)
  const boundary = toolExecutionBoundary(tool)
  const boundaryMeta = TOOL_BOUNDARY_META[boundary]
  const boundaryTone = boundaryMeta.tone === "good" ? "text-ref-ink" : boundaryMeta.tone === "warn" ? "text-ref-warn" : "text-ref-ink-muted"
  return (
    <article className="@container rounded-[3px] border border-ref-hairline bg-ref-paper px-4 py-4 @sm:px-5 @sm:py-5">
      <div className="flex flex-col gap-2 @sm:flex-row @sm:items-start @sm:justify-between">
        <h3 className="min-w-0 flex-1 text-balance font-sans text-[15px] font-semibold leading-snug text-ref-ink">{tool.name}</h3>
        <span className={`shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] ${boundaryTone}`}>{boundaryMeta.label}</span>
      </div>
      {template?.description && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ref-ink-muted">{template.description}</p>}
      <div className="mt-3">
        <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ref-ink-muted">Provides</dt>
        <dd className="mt-1 text-[12px] leading-snug text-ref-ink">{template?.provides.length ? template.provides.join(", ") : "Nothing yet"}</dd>
      </div>
      <button
        type="button"
        onClick={onConfigure}
        className="mt-3 rounded-[2px] border border-ref-hairline px-2.5 py-1 font-sans text-[11px] text-ref-ink-muted transition-colors outline-offset-2 hover:border-ref-ink/30 hover:text-ref-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ref-accent)]"
      >
        Configure
      </button>
    </article>
  )
}

/* ---- Policies — real BehaviorRule data, condition -> outcome. No
 * fabricated policy titles or approver roles: the domain doesn't have
 * a Role/Permission concept yet (docs/domain-model.md), so this shows
 * exactly the two real fields a BehaviorRule has. ---- */

function PoliciesSection({ worker, onNavigateToStep }: { worker: Worker; onNavigateToStep: (step: StepKey) => void }) {
  return (
    <DocSection eyebrow="Policies" hint="Guardrails this Worker's actions must pass through." action={<ConfigureLink onClick={() => onNavigateToStep("behavior")} />}>
      {worker.behaviors.length === 0 ? (
        <EmptyRow text="No policies configured yet." actionLabel="Add a policy" onClick={() => onNavigateToStep("behavior")} />
      ) : (
        <div className="flex flex-col gap-3">
          {worker.behaviors.map((b, i) => (
            <article key={b.id} className="rounded-[3px] border border-ref-hairline bg-ref-paper px-4 py-4">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ref-ink-muted">Policy {i + 1}</p>
              <div className="mt-2 flex flex-col gap-2 @sm:flex-row @sm:items-center @sm:gap-3">
                <div className="min-w-0 flex-1 rounded-[2px] border border-ref-hairline px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-ref-ink-muted">Condition</p>
                  <p className="mt-1 text-[12.5px] leading-snug text-ref-ink">{b.condition}</p>
                </div>
                <ArrowRight className="hidden size-4 shrink-0 text-ref-ink-muted @sm:block" aria-hidden />
                <div className="min-w-0 flex-1 rounded-[2px] border border-ref-hairline px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-ref-ink-muted">Outcome</p>
                  <p className="mt-1 text-[12.5px] leading-snug text-ref-ink">{b.action}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </DocSection>
  )
}

/* ---- secondary column ---- */

function ReadinessPanel({ readiness }: { readiness: ReturnType<typeof computeReadiness> }) {
  const ready = readiness.blockers.length === 0 && readiness.percent === 100
  return (
    <PanelBox eyebrow="Worker readiness">
      <dl className="flex flex-col gap-2">
        {readiness.steps.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2">
            <dt className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ref-ink-muted">{s.label}</dt>
            <dd
              title={s.detail}
              className={`min-w-0 flex-1 truncate text-right font-mono text-[10px] ${s.done ? "text-ref-ink" : "text-ref-ink-muted/70"}`}
            >
              {s.done ? "✓" : "○"} {s.detail}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`mt-4 border-t border-ref-hairline pt-3 font-mono text-[10px] uppercase tracking-[0.12em] ${ready ? "text-ref-ink" : "text-ref-warn"}`}>
        {ready ? "Simulation ready" : "Needs configuration"}
      </p>
    </PanelBox>
  )
}

function AutonomyPanel({ worker }: { worker: Worker }) {
  const currentLevel = autonomyLevelFor(worker.autonomy)
  const meta = AUTONOMY_LEVEL_META[currentLevel]
  return (
    <PanelBox eyebrow="Autonomy">
      <div className="flex flex-wrap gap-1.5">
        {AUTONOMY_LEVEL_ORDER.map((level) => {
          const levelMeta = AUTONOMY_LEVEL_META[level]
          const active = level === currentLevel
          const reachable = !!levelMeta.storedValue
          return (
            <button
              key={level}
              type="button"
              disabled={!reachable}
              onClick={() => levelMeta.storedValue && workforceStore.setAutonomy(worker.id, levelMeta.storedValue)}
              title={reachable ? undefined : "Not available yet"}
              className={`rounded-[2px] border px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ref-accent)] ${
                active
                  ? "border-ref-accent bg-ref-accent-soft text-ref-accent"
                  : reachable
                    ? "border-ref-hairline text-ref-ink-muted hover:border-ref-ink/30 hover:text-ref-ink"
                    : "cursor-not-allowed border-ref-hairline text-ref-ink-muted/40"
              }`}
            >
              {levelMeta.levelNumber} — {levelMeta.label}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ref-ink-muted">{meta.summary}</p>
      <AutonomyList title="Can do" items={meta.canDo} />
      <AutonomyList title="Cannot do" items={meta.cannotDo} />
      <AutonomyList title="Requires approval" items={meta.requiresApproval} />
    </PanelBox>
  )
}

function AutonomyList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-ref-ink-muted">{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item} className="text-[11.5px] leading-snug text-ref-ink">{item}</li>
        ))}
      </ul>
    </div>
  )
}

function DataReadinessPanel({ financialTool }: { financialTool?: WorkforceTool }) {
  return (
    <PanelBox eyebrow="Data readiness">
      <div className="flex flex-col gap-2.5">
        {FUTURE_CONNECTOR_CATEGORIES.map((category) => (
          <div key={category.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ref-ink">{category.name}</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ref-ink-muted">Not connected</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ref-ink-muted">Unlocks: {category.unlocks.join(", ")}</p>
          </div>
        ))}
        <div className="border-t border-ref-hairline pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ref-ink"><Wallet className="size-3.5 text-ref-accent" aria-hidden />Demo data</span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ref-accent">{financialTool ? "Available" : "Not applicable"}</span>
          </div>
          {financialTool && <p className="mt-0.5 text-[11px] leading-relaxed text-ref-ink-muted">A clearly fictional financial dataset — never presented as a real bank/ERP/accounting feed.</p>}
        </div>
      </div>
    </PanelBox>
  )
}

function ActivityPanel({ recent }: { recent: ReturnType<typeof todaysTimeline> }) {
  return (
    <PanelBox eyebrow="Recent activity">
      {recent.length === 0 ? (
        <p className="text-[12px] italic text-ref-ink-muted">No activity yet today.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {recent.map((r) => (
            <li key={r.id} className="flex gap-3">
              <span className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-ref-ink-muted">{timeOfDay(r.ts)}</span>
              <span className={`min-w-0 flex-1 text-[12px] leading-snug ${r.tone === "bad" ? "text-ref-critical" : r.tone === "warn" ? "text-ref-warn" : "text-ref-ink"}`}>{r.text}</span>
            </li>
          ))}
        </ol>
      )}
    </PanelBox>
  )
}

function timeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

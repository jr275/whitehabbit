"use client"

/* ------------------------------------------------------------------ *
 * BUILD PANEL (left zone) — the 9-stage worker builder.
 *
 *   01 Identity · 02 Mission · 03 Knowledge · 04 Skills · 05 Tools
 *   06 Behavior · 07 Channels · 08 Test · 09 Release
 *
 * A stepper, not a form: each stage shows a completion state and a
 * one-line summary in the rail; clicking a stage opens its editor
 * inline. Every control writes straight to the workforce store, and
 * the Worker canvas + Live Outputs panel update immediately.
 * ------------------------------------------------------------------ */

import { Check, Loader2, Plus, Rocket, Trash2, X } from "lucide-react"
import { useState } from "react"
import { BEHAVIOR_PRESETS, CHANNEL_CATALOG, KNOWLEDGE_TEMPLATES, SKILL_CATALOG, TONE_PRESETS, TOOL_CATALOG } from "@/lib/workforce/catalog"
import type { Autonomy, ChannelId, SkillCategory, Worker } from "@/lib/workforce/model"
import { OUTCOME_PRESETS, SKILL_CATEGORIES, SKILL_CATEGORY_LABEL, TOOL_BOUNDARY_META, toolExecutionBoundary } from "@/lib/workforce/model"
import { computeReadiness } from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

type StepKey = "identity" | "mission" | "knowledge" | "skills" | "tools" | "behavior" | "channels" | "test" | "release"

const STEPS: { key: StepKey; number: string; label: string }[] = [
  { key: "identity", number: "01", label: "Identity" },
  { key: "mission", number: "02", label: "Mission" },
  { key: "knowledge", number: "03", label: "Knowledge" },
  { key: "skills", number: "04", label: "Skills" },
  { key: "tools", number: "05", label: "Tools" },
  { key: "behavior", number: "06", label: "Behavior" },
  { key: "channels", number: "07", label: "Channels" },
  { key: "test", number: "08", label: "Test" },
  { key: "release", number: "09", label: "Release" },
]

function stepSummary(worker: Worker, key: StepKey): string {
  switch (key) {
    case "identity":
      return worker.identity.name ? `${worker.identity.name} · ${worker.identity.role || "—"}` : "Not set"
    case "mission":
      return worker.mission.trim() ? truncate(worker.mission, 46) : "Not set"
    case "knowledge":
      return `${worker.knowledge.length} source${worker.knowledge.length === 1 ? "" : "s"}`
    case "skills":
      return `${worker.skills.filter((s) => s.enabled).length} configured`
    case "tools":
      return `${worker.tools.filter((t) => t.connected).length} available`
    case "behavior":
      return `${worker.behaviors.length} rule${worker.behaviors.length === 1 ? "" : "s"}`
    case "channels":
      return `${worker.channels.filter((c) => c.connected).length} connected`
    case "test":
      return worker.tested ? "Passed" : "Not tested"
    case "release":
      return worker.status === "live" || worker.status === "working" || worker.status === "idle" ? "Live" : "Not released"
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trim()}…` : s
}

export function BuildPanel({ worker }: { worker: Worker }) {
  const [openKey, setOpenKey] = useState<StepKey>("identity")
  const currentIndex = STEPS.findIndex((s) => s.key === openKey)

  return (
    <div className="flex h-full flex-col overflow-y-auto thin-scroll-light px-3 py-3">
      {STEPS.map((step, i) => {
        const status: "done" | "active" | "upcoming" = i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming"
        const open = step.key === openKey
        return (
          <div key={step.key} className="border-b border-border/70 last:border-b-0">
            <button
              onClick={() => setOpenKey(step.key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors ${
                open ? "bg-secondary" : "hover:bg-secondary/60"
              }`}
            >
              <StepIcon status={status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[9px] text-muted-foreground">{step.number}</span>
                  <span className={`text-[13px] font-medium ${status === "upcoming" ? "text-muted-foreground" : "text-foreground"}`}>
                    {step.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{stepSummary(worker, step.key)}</p>
              </div>
            </button>
            {open && (
              <div className="px-2 pb-4 pt-1">
                <StepEditor step={step.key} worker={worker} onAdvance={() => advance(step.key, setOpenKey)} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function advance(current: StepKey, setOpenKey: (k: StepKey) => void) {
  const i = STEPS.findIndex((s) => s.key === current)
  if (i < STEPS.length - 1) setOpenKey(STEPS[i + 1].key)
}

function StepIcon({ status }: { status: "done" | "active" | "upcoming" }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-grow/15 text-grow">
        <Check className="h-3 w-3" />
      </span>
    )
  }
  if (status === "active") {
    return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-primary bg-primary/15" />
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border border-border" />
}

/* ==================================================================
 * STEP EDITORS
 * ================================================================== */

function StepEditor({ step, worker, onAdvance }: { step: StepKey; worker: Worker; onAdvance: () => void }) {
  switch (step) {
    case "identity":
      return <IdentityStep worker={worker} onAdvance={onAdvance} />
    case "mission":
      return <MissionStep worker={worker} onAdvance={onAdvance} />
    case "knowledge":
      return <KnowledgeStep worker={worker} onAdvance={onAdvance} />
    case "skills":
      return <SkillsStep worker={worker} onAdvance={onAdvance} />
    case "tools":
      return <ToolsStep worker={worker} onAdvance={onAdvance} />
    case "behavior":
      return <BehaviorStep worker={worker} onAdvance={onAdvance} />
    case "channels":
      return <ChannelsStep worker={worker} onAdvance={onAdvance} />
    case "test":
      return <TestStep worker={worker} onAdvance={onAdvance} />
    case "release":
      return <ReleaseStep worker={worker} />
  }
}

function Continue({ onClick, label = "Continue" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      {label}
    </button>
  )
}

/* ---- 01 Identity ---- */
function IdentityStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Name">
        <input
          value={worker.identity.name}
          onChange={(e) => workforceStore.updateIdentity(worker.id, { name: e.target.value })}
          placeholder="Atlas"
          className="modal-input"
        />
      </Field>
      <Field label="Role">
        <input
          value={worker.identity.role}
          onChange={(e) => workforceStore.updateIdentity(worker.id, { role: e.target.value })}
          placeholder="AI Growth Worker"
          className="modal-input"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={worker.identity.description}
          onChange={(e) => workforceStore.updateIdentity(worker.id, { description: e.target.value })}
          rows={3}
          placeholder="Research prospects, create content, manage social communication and execute growth tasks."
          className="modal-input resize-none"
        />
      </Field>
      <Field label="Persona">
        <textarea
          value={worker.identity.persona}
          onChange={(e) => workforceStore.updateIdentity(worker.id, { persona: e.target.value })}
          rows={2}
          placeholder="A senior growth operator — direct, evidence-driven."
          className="modal-input resize-none"
        />
      </Field>
      <Field label="Communication style">
        <div className="flex flex-wrap gap-1.5">
          {TONE_PRESETS.map((t) => {
            const on = worker.identity.tone.includes(t)
            return (
              <button
                key={t}
                onClick={() => workforceStore.toggleTone(worker.id, t)}
                className={`rounded-md border px-2 py-1 text-[11.5px] transition-colors ${
                  on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>
      </Field>
      <Continue onClick={onAdvance} />
    </div>
  )
}

/* ---- 02 Mission ---- */
function MissionStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  const [text, setText] = useState(worker.mission)
  const [newObjective, setNewObjective] = useState("")

  const commit = () => {
    workforceStore.setMission(worker.id, text)
    workforceStore.deriveObjectives(worker.id)
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Mission">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          rows={3}
          placeholder="Research prospects, create content, manage Instagram conversations and identify qualified sales opportunities."
          className="modal-input resize-none"
        />
      </Field>
      <button
        onClick={commit}
        className="self-start rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
      >
        Generate objectives
      </button>

      {worker.objectives.length > 0 && (
        <div>
          <SmallLabel>Objectives</SmallLabel>
          <div className="flex flex-col gap-1.5">
            {worker.objectives.map((o) => (
              <div key={o.id} className="group flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
                <button onClick={() => workforceStore.toggleObjective(worker.id, o.id)}>
                  <Check className={`h-3.5 w-3.5 ${o.done ? "text-grow" : "text-muted-foreground/40"}`} />
                </button>
                <input
                  value={o.text}
                  onChange={(e) => workforceStore.editObjective(worker.id, o.id, e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none"
                />
                <button
                  onClick={() => workforceStore.removeObjective(worker.id, o.id)}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
        <input
          value={newObjective}
          onChange={(e) => setNewObjective(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newObjective.trim()) {
              workforceStore.addObjective(worker.id, newObjective)
              setNewObjective("")
            }
          }}
          placeholder="Add an objective…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <OutcomeEditor worker={worker} />

      <Continue onClick={onAdvance} />
    </div>
  )
}

/* ---- what outcome should this worker produce? ---- */
function OutcomeEditor({ worker }: { worker: Worker }) {
  const [secondary, setSecondary] = useState("")
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <SmallLabel>What outcome should this worker produce?</SmallLabel>
      <div className="flex flex-wrap gap-1.5">
        {OUTCOME_PRESETS.map((p) => {
          const active = worker.outcome.primaryKPI === p.primaryKPI
          return (
            <button
              key={p.vertical}
              onClick={() => workforceStore.setOutcome(worker.id, { primaryKPI: p.primaryKPI, secondaryKPIs: p.secondaryKPIs })}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                active ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.vertical} · {p.primaryKPI}
            </button>
          )
        })}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        <Field label="Primary KPI">
          <input
            value={worker.outcome.primaryKPI}
            onChange={(e) => workforceStore.setOutcome(worker.id, { primaryKPI: e.target.value })}
            placeholder="Qualified Leads"
            className="modal-input"
          />
        </Field>
        <Field label="Secondary KPIs">
          <div className="flex flex-wrap gap-1.5">
            {worker.outcome.secondaryKPIs.map((kpi) => (
              <span key={kpi} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-foreground">
                {kpi}
                <button
                  onClick={() => workforceStore.setOutcome(worker.id, { secondaryKPIs: worker.outcome.secondaryKPIs.filter((k) => k !== kpi) })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && secondary.trim()) {
                  workforceStore.setOutcome(worker.id, { secondaryKPIs: [...worker.outcome.secondaryKPIs, secondary.trim()] })
                  setSecondary("")
                }
              }}
              placeholder="Add a KPI…"
              className="min-w-[6rem] flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </Field>
      </div>
    </div>
  )
}

/* ---- 03 Knowledge ---- */
function KnowledgeStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  const totalDocs = worker.knowledge.reduce((s, k) => s + k.documents, 0)
  const confidence = worker.knowledge.length ? Math.min(99.6, 90 + Math.min(9, worker.knowledge.length) * 1.1).toFixed(1) : "0.0"

  return (
    <div className="flex flex-col gap-3">
      {worker.knowledge.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-secondary/40 p-2.5 text-center">
          <MiniStat value={String(worker.knowledge.length)} label="Sources" />
          <MiniStat value={totalDocs.toLocaleString()} label="Documents" />
          <MiniStat value={`${confidence}%`} label="Confidence" />
        </div>
      )}
      <div>
        <SmallLabel>Connect knowledge</SmallLabel>
        <div className="flex flex-wrap gap-1.5">
          {KNOWLEDGE_TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => workforceStore.addKnowledge(worker.id, t)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-3 w-3" /> {t.name}
            </button>
          ))}
        </div>
      </div>
      {worker.knowledge.length > 0 && (
        <div className="flex flex-col gap-2">
          {worker.knowledge.map((k) => (
            <div key={k.id} className="group flex flex-col gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-foreground">{k.name}</div>
                  <div className="text-[10.5px] text-muted-foreground">{k.documents.toLocaleString()} documents · {k.type}</div>
                </div>
                <button
                  onClick={() => workforceStore.removeKnowledge(worker.id, k.id)}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <KnowledgeContentField worker={worker} source={k} />
            </div>
          ))}
        </div>
      )}
      <Continue onClick={onAdvance} />
    </div>
  )
}

/* Real reference text the LLM can actually be given — see
 * lib/agent/knowledge.ts. This card is metadata (a name + document
 * count) until someone types real content here; there is no ingestion
 * pipeline behind "documents", so this is the one honest way to make
 * a knowledge source do anything in a real execution. */
function KnowledgeContentField({ worker, source }: { worker: Worker; source: Worker["knowledge"][number] }) {
  const [text, setText] = useState(source.content ?? "")
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => workforceStore.setKnowledgeContent(worker.id, source.id, text)}
      rows={2}
      placeholder="Paste real reference text this worker should consider (optional) — nothing is fetched automatically."
      className="modal-input resize-none text-[11.5px]"
    />
  )
}

/* ---- 04 Skills ---- */
function SkillsStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {SKILL_CATEGORIES.map((cat) => {
        const items = SKILL_CATALOG.filter((s) => s.category === cat)
        return (
          <div key={cat}>
            <SmallLabel>{SKILL_CATEGORY_LABEL[cat]}</SmallLabel>
            <div className="flex flex-col gap-1">
              {items.map((tpl) => {
                const enabled = worker.skills.find((s) => s.id === tpl.id)?.enabled ?? false
                return (
                  <button
                    key={tpl.id}
                    onClick={() => workforceStore.toggleSkill(worker.id, tpl.id)}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-secondary/60"
                  >
                    <Switch on={enabled} />
                    <span className={`text-[12.5px] ${enabled ? "text-foreground" : "text-muted-foreground"}`}>{tpl.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <Continue onClick={onAdvance} />
    </div>
  )
}

/* ---- 05 Tools — `enabled` is a permission the user grants; `connected`
 * is a REAL fact the server computes (env var / credential present).
 * Toggling the switch never fakes a connection — a tool the worker is
 * permitted to use can still show "Not connected" until it really is. */
function ToolsStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {worker.tools.map((tool) => {
        const template = TOOL_CATALOG.find((t) => t.id === tool.id)
        return (
          <div key={tool.id} className="rounded-lg border border-border bg-card px-2.5 py-2">
            <button onClick={() => workforceStore.toggleTool(worker.id, tool.id)} className="flex w-full items-center gap-2">
              <Switch on={tool.enabled} />
              <span className={`flex-1 text-left text-[12.5px] font-medium ${tool.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                {tool.name}
              </span>
              <RiskTag risk={tool.risk} />
            </button>
            <div className="mt-1.5 flex items-start justify-between gap-2 pl-[1.625rem]">
              <p className={`text-[11px] leading-relaxed ${tool.connected ? "text-muted-foreground" : "text-warn"}`}>
                {tool.connected ? template?.description : (tool.notConnectedReason ?? "Not connected")}
              </p>
              <BoundaryTag boundary={toolExecutionBoundary(tool)} />
            </div>
          </div>
        )
      })}
      <Continue onClick={onAdvance} />
    </div>
  )
}

/* real available/connected/executable/requires-approval distinction —
 * never just "on" — see toolExecutionBoundary() in lib/workforce/model. */
function BoundaryTag({ boundary }: { boundary: ReturnType<typeof toolExecutionBoundary> }) {
  const meta = TOOL_BOUNDARY_META[boundary]
  const cls = meta.tone === "good" ? "text-grow" : meta.tone === "warn" ? "text-warn" : "text-muted-foreground"
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-wider ${cls}`}>
      {meta.tone === "good" && <Check className="h-2.5 w-2.5" />}
      {meta.label}
    </span>
  )
}

function RiskTag({ risk }: { risk: "low" | "medium" | "high" | "critical" }) {
  const cls = risk === "critical" || risk === "high" ? "text-destructive bg-destructive/10" : risk === "medium" ? "text-warn bg-warn/10" : "text-grow bg-grow/10"
  return <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${cls}`}>{risk}</span>
}

/* ---- 06 Behavior ---- */
function BehaviorStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  const [text, setText] = useState("")
  const submit = () => {
    if (!text.trim()) return
    workforceStore.addBehavior(worker.id, text)
    setText("")
  }
  return (
    <div className="flex flex-col gap-2">
      {worker.behaviors.map((b) => (
        <div key={b.id} className="group flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="min-w-0 flex-1 text-[12px] leading-relaxed">
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">IF </span>
            <span className="text-foreground">{b.condition}</span>
            <span className="font-mono text-muted-foreground"> → </span>
            <span className="text-foreground">{b.action}</span>
          </div>
          <button
            onClick={() => workforceStore.removeBehavior(worker.id, b.id)}
            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div>
        <SmallLabel>Presets</SmallLabel>
        <div className="flex flex-col gap-1">
          {BEHAVIOR_PRESETS.filter((p) => !worker.behaviors.some((b) => b.raw === p)).map((p) => (
            <button
              key={p}
              onClick={() => workforceStore.addBehavior(worker.id, p)}
              className="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-3 w-3" /> {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="IF confidence < 70% → request human review"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button onClick={submit} disabled={!text.trim()} className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-foreground disabled:opacity-40">
          Add
        </button>
      </div>
      <Continue onClick={onAdvance} />
    </div>
  )
}

/* ---- 07 Channels ---- */
const AUTONOMY_LEVELS: Autonomy[] = ["low", "medium", "high"]

function ChannelsStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] italic text-muted-foreground">One Worker. Multiple channels.</p>
      <div className="flex flex-col gap-1.5">
        {CHANNEL_CATALOG.map((c) => {
          const connected = worker.channels.find((x) => x.id === c.id)?.connected ?? false
          return (
            <button
              key={c.id}
              onClick={() => workforceStore.toggleChannel(worker.id, c.id as ChannelId)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
            >
              <Switch on={connected} />
              <span className={`text-[12.5px] ${connected ? "text-foreground" : "text-muted-foreground"}`}>{c.name}</span>
            </button>
          )
        })}
      </div>
      <div>
        <SmallLabel>Autonomy</SmallLabel>
        <div className="flex gap-1.5">
          {AUTONOMY_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => workforceStore.setAutonomy(worker.id, lvl)}
              className={`flex-1 rounded-lg border px-2 py-1.5 font-mono text-[10.5px] uppercase tracking-wide transition-colors ${
                worker.autonomy === lvl ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>
      <Continue onClick={onAdvance} />
    </div>
  )
}

/* ---- 08 Test ---- */
function TestStep({ worker, onAdvance }: { worker: Worker; onAdvance: () => void }) {
  const { testingWorkerId } = useWorkforce()
  const testing = testingWorkerId === worker.id
  const checks = [
    { label: "Identity set", pass: !!worker.identity.name.trim() },
    { label: "Mission set", pass: !!worker.mission.trim() },
    { label: "At least one skill enabled", pass: worker.skills.some((s) => s.enabled) },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-[12px]">
            {c.pass ? <Check className="h-3.5 w-3.5 text-grow" /> : <span className="h-3.5 w-3.5 rounded-full border border-border" />}
            <span className={c.pass ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => workforceStore.testWorker(worker.id)}
        disabled={testing}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Loader2 className={`h-3.5 w-3.5 ${testing ? "animate-spin" : "hidden"}`} />
        {worker.tested ? "Re-run test" : "Run test"}
      </button>
      {worker.tested && (
        <div className="flex items-center gap-1.5 text-[12px] text-grow">
          <Check className="h-3.5 w-3.5" /> Test passed
        </div>
      )}
      <Continue onClick={onAdvance} label="Continue to release" />
    </div>
  )
}

/* ---- 09 Release ---- */
function ReleaseStep({ worker }: { worker: Worker }) {
  const readiness = computeReadiness(worker)
  const isLive = worker.status !== "draft"
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Readiness</span>
          <span className="font-mono text-[13px] font-semibold text-foreground">{readiness.percent}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${readiness.percent}%` }} />
        </div>
      </div>
      {isLive ? (
        <div className="flex items-center gap-2 rounded-lg border border-grow/30 bg-grow/8 px-3 py-2.5 text-[12.5px] text-grow">
          <Check className="h-4 w-4" />
          Live since {worker.releasedAt ? new Date(worker.releasedAt).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—"}
        </div>
      ) : (
        <button
          onClick={() => workforceStore.releaseWorker(worker.id)}
          disabled={!worker.tested}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Rocket className="h-3.5 w-3.5" />
          Release worker
        </button>
      )}
      {!worker.tested && <p className="text-[11px] text-muted-foreground">Pass the Test step before releasing.</p>}
    </div>
  )
}

/* ---- shared bits ---- */
function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-card transition-transform ${on ? "translate-x-3.5" : "translate-x-0.5"}`} />
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-[13px] font-medium tabular-nums text-foreground">{value}</div>
      <div className="text-[9.5px] text-muted-foreground">{label}</div>
    </div>
  )
}

/* re-export for callers that only need category typing */
export type { SkillCategory }

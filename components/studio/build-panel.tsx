"use client"

/* ------------------------------------------------------------------ *
 * BUILD PANEL (left zone) — the worker's configurable surface.
 * Every control writes straight to the store. Objective, capabilities,
 * knowledge, tools, policies and autonomy are all real state; the
 * Build pipeline validates and compiles that state into a version.
 * ------------------------------------------------------------------ */

import { useState } from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react"
import {
  AUTONOMY_DESCRIPTION,
  type Autonomy,
  type Capability,
  type Permission,
  type RiskLevel,
  type Tool,
  TOOL_CATALOG,
} from "@/lib/worker/worker-model"
import { studioStore, useStudio } from "@/lib/worker/worker-state"

const AUTONOMY_LEVELS: Autonomy[] = ["low", "medium", "high"]
const PERMISSIONS: Permission[] = ["allow", "ask", "block"]

export function BuildPanel() {
  const { worker, buildStatus, buildSteps, buildError } = useStudio()
  if (!worker) return null

  const enabledCaps = worker.capabilities.filter((c) => c.enabled).length
  const canRelease = !!worker.version && worker.status !== "live" && worker.status !== "working" && worker.status !== "waiting"
  const isLive = worker.status === "live" || worker.status === "working" || worker.status === "waiting" || worker.status === "idle"

  return (
    <div className="flex h-full flex-col">
      {/* scrollable config */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <SectionLabel>Objective</SectionLabel>
        <ObjectiveEditor objective={worker.objective} />

        <SectionLabel
          count={`${enabledCaps}/${worker.capabilities.length} on`}
          action={<AddCapabilityButton />}
        >
          Capabilities
        </SectionLabel>
        <div className="flex flex-col gap-1.5">
          {worker.capabilities.map((c) => (
            <CapabilityRow key={c.id} cap={c} />
          ))}
        </div>

        <SectionLabel count={`${worker.knowledge.length} item${worker.knowledge.length === 1 ? "" : "s"}`}>
          Knowledge
        </SectionLabel>
        <KnowledgeEditor />

        <SectionLabel count={`${worker.tools.filter((t) => t.enabled).length} enabled`}>Tools</SectionLabel>
        <div className="flex flex-col gap-1.5">
          {worker.tools.map((t) => (
            <ToolRow key={t.id} tool={t} />
          ))}
        </div>

        <SectionLabel count={`${worker.policies.length} active`}>Policies</SectionLabel>
        <PolicyEditor />

        <SectionLabel>Autonomy</SectionLabel>
        <div className="flex gap-1.5">
          {AUTONOMY_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => studioStore.setAutonomy(lvl)}
              className={`flex-1 rounded-lg border px-2 py-2 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                worker.autonomy === lvl
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {AUTONOMY_DESCRIPTION[worker.autonomy]}
        </p>
      </div>

      {/* sticky build footer */}
      <div className="border-t border-border bg-card/60 p-4">
        {buildError && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Worker cannot build
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-foreground">{buildError}</p>
          </div>
        )}

        {buildSteps.length > 0 && buildStatus !== "idle" && (
          <ul className="mb-3 flex flex-col gap-1.5 rounded-lg border border-border bg-background/50 p-3">
            {buildSteps.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[12px]">
                {s.status === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-grow" />
                ) : s.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-border" />
                )}
                <span className={s.status === "pending" ? "text-muted-foreground" : "text-foreground"}>
                  {s.label}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
          <span className="text-muted-foreground">
            Version <span className="text-foreground">{worker.version || "—"}</span>
          </span>
          <WorkerStatusPill />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => studioStore.buildWorker()}
            disabled={buildStatus === "validating" || buildStatus === "building"}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {buildStatus === "validating" || buildStatus === "building" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {buildStatus === "building" ? "Compiling" : "Validating"}
              </>
            ) : buildStatus === "error" ? (
              "Retry build"
            ) : (
              "Build worker"
            )}
          </button>
          {(canRelease || isLive) && (
            <button
              onClick={() => studioStore.releaseWorker()}
              disabled={!canRelease}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isLive && !canRelease
                  ? "cursor-default border-grow/30 bg-grow/10 text-grow"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {isLive && !canRelease ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-grow" />
                  Live
                </>
              ) : (
                <>
                  <Rocket className="h-3.5 w-3.5" />
                  Release
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---- status pill reflecting the real state machine ---- */
function WorkerStatusPill() {
  const { worker } = useStudio()
  if (!worker) return null
  const map: Record<string, { cls: string; label: string; pulse?: boolean }> = {
    draft: { cls: "text-muted-foreground", label: "Draft" },
    ready: { cls: "text-primary", label: "Ready" },
    live: { cls: "text-grow", label: "Live", pulse: true },
    idle: { cls: "text-grow", label: "Live", pulse: true },
    working: { cls: "text-primary", label: "Working", pulse: true },
    waiting: { cls: "text-warn", label: "Waiting", pulse: true },
  }
  const s = map[worker.status] ?? map.draft
  return (
    <span className={`inline-flex items-center gap-1.5 ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${s.pulse ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  )
}

/* ---- objective ---- */
function ObjectiveEditor({ objective }: { objective: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(objective)
  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-foreground outline-none"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={() => {
              setDraft(objective)
              setEditing(false)
            }}
            className="rounded-md px-2.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              studioStore.updateObjective(draft)
              setEditing(false)
            }}
            className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground"
          >
            Save
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="group relative rounded-lg border border-border bg-card p-3">
      <p className="pr-6 text-[13px] leading-relaxed text-foreground">{objective}</p>
      <button
        onClick={() => {
          setDraft(objective)
          setEditing(true)
        }}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
        aria-label="Edit objective"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/* ---- capability row ---- */
function CapabilityRow({ cap }: { cap: ReturnType<typeof useStudio>["worker"] extends infer W ? W extends { capabilities: (infer C)[] } ? C : never : never }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Switch on={cap.enabled} onClick={() => studioStore.toggleCapability(cap.id)} />
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`truncate text-[13px] font-medium ${cap.enabled ? "text-foreground" : "text-muted-foreground"}`}>
            {cap.name}
          </span>
          {cap.status === "new" && (
            <span className="rounded bg-primary/10 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
              new
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">v{cap.version}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-border px-3 py-3">
          <p className="text-[12px] leading-relaxed text-foreground">{cap.description}</p>
          <dl className="mt-2.5 flex flex-col gap-1.5 text-[11px]">
            <DetailRow k="Purpose" v={cap.purpose} />
            <DetailRow k="Category" v={cap.category} />
            <DetailRow k="Tools" v={cap.tools.length ? cap.tools.join(", ") : "none"} />
            <DetailRow k="Success" v={cap.successCriteria} />
            <DetailRow k="Risk" v={cap.riskLevel} />
          </dl>
          <button
            onClick={() => studioStore.removeCapability(cap.id)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" /> Remove capability
          </button>
        </div>
      )}
    </div>
  )
}

/* ---- add capability modal ---- */
function AddCapabilityButton() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: "",
    description: "",
    purpose: "",
    tools: [] as string[],
    successCriteria: "",
    riskLevel: "low" as RiskLevel,
  })
  const reset = () =>
    setForm({ name: "", description: "", purpose: "", tools: [], successCriteria: "", riskLevel: "low" })

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Add
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
                Add capability
              </h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-5">
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Negotiation"
                  className="modal-input"
                />
              </Field>
              <Field label="Description">
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Handles pricing objections."
                  className="modal-input"
                />
              </Field>
              <Field label="Purpose">
                <input
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  placeholder="Close the deal."
                  className="modal-input"
                />
              </Field>
              <Field label="Tools">
                <div className="flex flex-wrap gap-1.5">
                  {TOOL_CATALOG.map((t) => {
                    const sel = form.tools.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() =>
                          setForm({
                            ...form,
                            tools: sel ? form.tools.filter((x) => x !== t.id) : [...form.tools, t.id],
                          })
                        }
                        className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                          sel ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field label="Success criteria">
                <input
                  value={form.successCriteria}
                  onChange={(e) => setForm({ ...form, successCriteria: e.target.value })}
                  placeholder="Deal closed within 30 days."
                  className="modal-input"
                />
              </Field>
              <Field label="Risk level">
                <div className="flex gap-1.5">
                  {(["low", "medium", "high"] as RiskLevel[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setForm({ ...form, riskLevel: r })}
                      className={`flex-1 rounded-md border px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                        form.riskLevel === r ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                disabled={!form.name.trim()}
                onClick={() => {
                  studioStore.addCapability({
                    ...form,
                    description: form.description || "Custom capability.",
                    purpose: form.purpose || "—",
                    successCriteria: form.successCriteria || "—",
                  })
                  reset()
                  setOpen(false)
                }}
                className="rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
              >
                Add to worker
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ---- knowledge ---- */
function KnowledgeEditor() {
  const { worker } = useStudio()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  if (!worker) return null
  return (
    <div className="flex flex-col gap-1.5">
      {worker.knowledge.map((k) => (
        <div key={k.id} className="group flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-foreground">{k.title}</div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{k.content}</p>
          </div>
          <button
            onClick={() => studioStore.removeKnowledge(k.id)}
            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            aria-label="Remove knowledge"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            autoFocus
            className="mb-2 w-full bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Enterprise prospects with more than 1000 employees should receive priority."
            className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setAdding(false)
                setTitle("")
                setContent("")
              }}
              className="rounded-md px-2.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              disabled={!content.trim()}
              onClick={() => {
                studioStore.addKnowledge(title, content)
                setAdding(false)
                setTitle("")
                setContent("")
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add knowledge
        </button>
      )}
    </div>
  )
}

/* ---- tools ---- */
function ToolRow({ tool }: { tool: ReturnType<typeof useStudio>["worker"] extends infer W ? W extends { tools: (infer T)[] } ? T : never : never }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <Switch on={tool.enabled} onClick={() => studioStore.toggleTool(tool.id)} />
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-medium ${tool.enabled ? "text-foreground" : "text-muted-foreground"}`}>
          {tool.name}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">{tool.description}</p>
      </div>
      {tool.enabled && (
        <select
          value={tool.permission}
          onChange={(e) => studioStore.setToolPermission(tool.id, e.target.value as Permission)}
          className="rounded-md border border-border bg-background px-1.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground outline-none"
        >
          {PERMISSIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/* ---- policies ---- */
function PolicyEditor() {
  const { worker } = useStudio()
  const [text, setText] = useState("")
  if (!worker) return null
  const submit = () => {
    if (!text.trim()) return
    studioStore.addPolicy(text)
    setText("")
  }
  return (
    <div className="flex flex-col gap-1.5">
      {worker.policies.map((p) => (
        <div key={p.id} className="group flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-grow" />
          <span className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">{p.text}</span>
          {p.kind === "confidence_threshold" && (
            <span className="shrink-0 rounded bg-warn/10 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-warn">
              gate
            </span>
          )}
          <button
            onClick={() => studioStore.removePolicy(p.id)}
            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            aria-label="Remove policy"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit()
          }}
          placeholder="Never send outbound email below 80% confidence."
          className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}

/* ---- small shared bits ---- */
function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-card transition-transform ${on ? "translate-x-3.5" : "translate-x-0.5"}`}
      />
    </button>
  )
}

function SectionLabel({
  children,
  count,
  action,
}: {
  children: React.ReactNode
  count?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between first:mt-0">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {children}
        </h2>
        {count && <span className="font-mono text-[10px] text-muted-foreground/60">{count}</span>}
      </div>
      {action}
    </div>
  )
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="text-right text-[11px] capitalize text-foreground">{v}</dd>
    </div>
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

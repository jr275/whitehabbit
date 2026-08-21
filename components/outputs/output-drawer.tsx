"use client"

/* ------------------------------------------------------------------ *
 * Output drawer — two modes over the same panel:
 *   LIST   — every output behind a clicked number or table row
 *   DETAIL — one output, fully inspected: status, quality, confidence,
 *            input/output, and execution metadata. No chain-of-thought,
 *            only concise decision summaries.
 * ------------------------------------------------------------------ */

import { ArrowLeft, X } from "lucide-react"
import { useEffect, useState } from "react"
import type { Worker, WorkerOutput } from "@/lib/workforce/model"
import { OUTPUT_STATUS_META, OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { timeOfDay } from "@/lib/workforce/selectors"

export function OutputDrawer({
  outputs,
  worker,
  title,
  onClose,
}: {
  outputs: WorkerOutput[]
  worker?: Worker
  title: string
  onClose: () => void
}) {
  const [selected, setSelected] = useState<WorkerOutput | null>(outputs.length === 1 ? outputs[0] : null)

  useEffect(() => {
    setSelected(outputs.length === 1 ? outputs[0] : null)
  }, [outputs])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          {selected && outputs.length > 1 && (
            <button onClick={() => setSelected(null)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{worker?.identity.name ?? "Outputs"}</p>
            <h2 className="truncate text-[15px] font-semibold text-foreground">{selected ? OUTPUT_TYPE_META[selected.type].label : title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="thin-scroll-light flex-1 overflow-y-auto">
          {!selected ? (
            <ul className="divide-y divide-border">
              {outputs.map((o) => {
                const status = OUTPUT_STATUS_META[o.status]
                return (
                  <li key={o.id}>
                    <button onClick={() => setSelected(o)} className="flex w-full flex-col items-start gap-1 px-5 py-3 text-left transition-colors hover:bg-secondary/50">
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">{o.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeOfDay(o.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusDot tone={status.tone} label={status.label} />
                        {o.qualityScore != null && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{o.qualityScore}%</span>}
                      </div>
                    </button>
                  </li>
                )
              })}
              {outputs.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No outputs to show.</p>}
            </ul>
          ) : (
            <DetailView output={selected} />
          )}
        </div>
      </div>
    </>
  )
}

function DetailView({ output }: { output: WorkerOutput }) {
  const status = OUTPUT_STATUS_META[output.status]
  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <div>
        <h3 className="text-pretty text-[16px] font-semibold leading-snug text-foreground">{output.title}</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Status">
            <StatusDot tone={status.tone} label={status.label} />
          </Field>
          <Field label="Quality">
            <span className="font-mono text-[13px] tabular-nums text-foreground">{output.qualityScore ?? "—"}%</span>
          </Field>
          <Field label="Confidence">
            <span className="font-mono text-[13px] tabular-nums text-foreground">{output.confidenceScore ?? "—"}%</span>
          </Field>
          <Field label="Channel">
            <span className="text-[13px] capitalize text-foreground">{output.channel ?? "—"}</span>
          </Field>
        </div>
      </div>

      {output.input && (
        <div>
          <SectionLabel>Input</SectionLabel>
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">
            &ldquo;{output.input}&rdquo;
          </p>
        </div>
      )}

      <div>
        <SectionLabel>Output</SectionLabel>
        <p className="whitespace-pre-line rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">
          {output.content}
        </p>
      </div>

      {/* quality breakdown */}
      <div>
        <SectionLabel>Output quality</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <QualityBar label="Quality" value={output.qualityScore} />
          <QualityBar label="Task success" value={output.taskSuccess} />
          <QualityBar label="Policy compliance" value={output.policyCompliance} />
          <QualityBar label="Brand adherence" value={output.brandAdherence} />
          <QualityBar label="Factuality" value={output.factuality} />
        </div>
      </div>

      {/* execution metadata */}
      <div>
        <SectionLabel>Execution metadata</SectionLabel>
        <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
          <MetaRow k="Timestamp" v={new Date(output.createdAt).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })} />
          <MetaRow k="Duration" v={output.durationMs ? `${Math.round(output.durationMs / 1000)}s` : "—"} />
          <MetaRow k="Model" v={output.model ?? "—"} />
          <MetaRow k="Tools used" v={output.toolsUsed?.length ? output.toolsUsed.join(", ") : "none"} />
          <MetaRow k="Knowledge used" v={output.knowledgeUsed?.length ? output.knowledgeUsed.join(", ") : "none"} />
          <MetaRow k="Policy checks" v={output.policyChecks?.length ? output.policyChecks.join(" · ") : "none"} />
          <MetaRow k="Approval" v={output.approval === "pending" ? "Pending" : output.approval === "approved" ? "Approved" : "Not required"} />
        </dl>
      </div>
    </div>
  )
}

function QualityBar({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[12px] font-medium tabular-nums text-foreground">{value ?? "—"}</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, v)}%` }} />
      </div>
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

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-[11.5px] text-muted-foreground">{k}</dt>
      <dd className="truncate text-right text-[11.5px] text-foreground">{v}</dd>
    </div>
  )
}

function StatusDot({ tone, label }: { tone: "good" | "info" | "warn" | "bad" | "muted"; label: string }) {
  const dot = tone === "good" ? "bg-grow" : tone === "info" ? "bg-primary" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-destructive" : "bg-muted-foreground/50"
  const text = tone === "good" ? "text-grow" : tone === "info" ? "text-primary" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-destructive" : "text-muted-foreground"
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className={`font-mono text-[11px] tracking-tight ${text}`}>{label}</span>
    </span>
  )
}

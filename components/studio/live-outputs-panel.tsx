"use client"

/* ------------------------------------------------------------------ *
 * LIVE OUTPUTS (right zone) — what the worker has actually produced.
 *
 * Before the worker has ever run, this panel does NOT fabricate an
 * example — generating one would mean making a real, billable LLM
 * call just to decorate an empty state. Instead it explains exactly
 * what will happen and why it can't happen yet (a tool not connected),
 * so the emptiness itself is informative. The moment a real run
 * completes, its real output — same rows the Outputs Hub reads —
 * appears here immediately.
 * ------------------------------------------------------------------ */

import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react"
import { useMemo } from "react"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import { OUTPUT_TYPE_META, type Worker, type WorkerOutput } from "@/lib/workforce/model"
import { timeAgo } from "@/lib/workforce/selectors"

export function LiveOutputsPanel({ worker, outputs, running }: { worker: Worker; outputs: WorkerOutput[]; running: boolean }) {
  const real = useMemo(
    () => outputs.filter((o) => o.workerId === worker.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 14),
    [outputs, worker.id],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground">Live Worker Outputs</span>
        {running && (
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Live
          </span>
        )}
      </div>

      <div className="thin-scroll-light flex-1 overflow-y-auto px-4 py-3">
        {real.length === 0 ? <EmptyState worker={worker} /> : (
          <div className="flex flex-col gap-2.5">
            {real.map((o) => (
              <OutputCard key={o.id} output={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ worker }: { worker: Worker }) {
  const enabledSkills = worker.skills.filter((s) => s.enabled)
  if (enabledSkills.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <Sparkles className="h-5 w-5 text-muted-foreground/50" />
        <p className="mt-2 text-[12.5px] text-muted-foreground">Turn on a skill to see what {worker.identity.name || "this worker"} will produce.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11.5px] text-muted-foreground">
        No outputs yet — nothing is fabricated here. Run {worker.identity.name || "this worker"} to see its real result.
      </p>
      {enabledSkills.map((s) => {
        const template = SKILL_CATALOG.find((t) => t.id === s.id)
        if (!template) return null
        const blockedTools = template.requiredTools
          .map((id) => worker.tools.find((t) => t.id === id))
          .filter((t) => t && !t.connected)
        return (
          <div key={s.id} className="rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
              <span className="text-[12.5px] font-medium text-foreground">{template.name}</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Will produce a {OUTPUT_TYPE_META[template.outputType]?.label.toLowerCase() ?? "result"} using {template.requiredTools.length} real tool
              {template.requiredTools.length === 1 ? "" : "s"}: {template.requiredTools.map((id) => worker.tools.find((t) => t.id === id)?.name ?? id).join(", ")}.
            </p>
            {blockedTools.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-warn/30 bg-warn/5 px-2.5 py-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn" />
                <p className="text-[11px] text-foreground">
                  {blockedTools.map((t) => t?.notConnectedReason ?? `${t?.name} not connected`).join(" · ")}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OutputCard({ output }: { output: WorkerOutput }) {
  const meta = OUTPUT_TYPE_META[output.type] ?? { label: output.type }
  return (
    <div className={`rounded-xl border bg-card p-3.5 ${output.status === "failed" ? "border-destructive/25" : "border-border"}`}>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{meta.label}</span>
      </div>
      <h4 className="mt-1.5 text-pretty text-[13px] font-medium leading-snug text-foreground">{output.title}</h4>
      <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">{output.content}</p>
      {output.sources && output.sources.length > 0 && (
        <p className="mt-2 truncate text-[10.5px] text-muted-foreground">{output.sources.length} real source{output.sources.length === 1 ? "" : "s"}</p>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        <span className={`font-mono text-[9.5px] uppercase tracking-wider ${output.status === "failed" ? "text-destructive" : "text-grow"}`}>
          {output.status === "failed" ? "Failed" : "Completed"}
        </span>
        <div className="flex items-center gap-2">
          {output.qualityScore != null && <span className="font-mono text-[11px] tabular-nums text-foreground">{output.qualityScore}%</span>}
          <span className="font-mono text-[10px] text-muted-foreground">{timeAgo(output.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}

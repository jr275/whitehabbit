"use client"

/* ------------------------------------------------------------------ *
 * LIVE OUTPUTS (right zone) — what the worker produces.
 * Before it has ever run, this shows live examples derived from the
 * skills you've turned on. The moment you click Run Worker, real
 * output records replace the examples as they're created — the same
 * WorkerOutput rows that feed the Outputs Hub.
 * ------------------------------------------------------------------ */

import {
  BarChart3,
  Calendar,
  Database,
  FileText,
  Film,
  Image as ImageIcon,
  LifeBuoy,
  Mail,
  MessageCircle,
  Search,
  Sparkles,
  Target,
} from "lucide-react"
import { useMemo } from "react"
import { generateOutput } from "@/lib/workforce/content"
import { OUTPUT_STATUS_META, OUTPUT_TYPE_META, type OutputKind, type Worker, type WorkerOutput } from "@/lib/workforce/model"
import { timeAgo } from "@/lib/workforce/selectors"

const KIND_ICON: Record<OutputKind, React.ElementType> = {
  research: Search,
  blog: FileText,
  reel: Film,
  social_post: ImageIcon,
  dm: MessageCircle,
  email: Mail,
  lead: Target,
  meeting: Calendar,
  crm: Database,
  analysis: BarChart3,
  support: LifeBuoy,
}

export function LiveOutputsPanel({ worker, outputs, running }: { worker: Worker; outputs: WorkerOutput[]; running: boolean }) {
  const real = useMemo(() => outputs.filter((o) => o.workerId === worker.id).slice(0, 14), [outputs, worker.id])

  const examples = useMemo(() => {
    if (real.length > 0) return []
    const enabled = worker.skills.filter((s) => s.enabled)
    return enabled.slice(0, 5).map((s, i) => ({
      kind: s.produces,
      generated: generateOutput(s.produces, worker, s.id.length * 13 + i),
    }))
  }, [worker, real.length])

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
        {real.length === 0 && examples.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <Sparkles className="h-5 w-5 text-muted-foreground/50" />
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Turn on a skill to preview what {worker.identity.name || "this worker"} can produce.
            </p>
          </div>
        )}

        {real.length === 0 && examples.length > 0 && (
          <>
            <p className="mb-3 text-[11px] italic text-muted-foreground">
              Examples of what {worker.identity.name || "this worker"} can produce, based on its skills.
            </p>
            <div className="flex flex-col gap-2.5">
              {examples.map((ex, i) => (
                <ExampleCard key={i} kind={ex.kind} generated={ex.generated} />
              ))}
            </div>
          </>
        )}

        {real.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {real.map((o) => (
              <RealCard key={o.id} output={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CardShell({ kind, title, tone, children }: { kind: OutputKind; title: string; tone?: "warn" | "bad"; children: React.ReactNode }) {
  const Icon = KIND_ICON[kind]
  const meta = OUTPUT_TYPE_META[kind]
  return (
    <div className={`rounded-xl border bg-card p-3.5 ${tone === "bad" ? "border-destructive/25" : tone === "warn" ? "border-warn/25" : "border-border"}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{meta.label}</span>
      </div>
      <h4 className="mt-1.5 text-pretty text-[13px] font-medium leading-snug text-foreground">{title}</h4>
      {children}
    </div>
  )
}

function ExampleCard({ kind, generated }: { kind: OutputKind; generated: ReturnType<typeof generateOutput> }) {
  return (
    <CardShell kind={kind} title={generated.title}>
      <p className="mt-1.5 whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">{generated.content}</p>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Example</span>
        <span className="font-mono text-[11px] tabular-nums text-foreground">{generated.qualityScore}%</span>
      </div>
    </CardShell>
  )
}

function RealCard({ output }: { output: WorkerOutput }) {
  const status = OUTPUT_STATUS_META[output.status]
  return (
    <CardShell kind={output.type} title={output.title} tone={output.status === "failed" ? "bad" : output.status === "awaiting_approval" ? "warn" : undefined}>
      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">{output.content}</p>
      <div className="mt-2.5 flex items-center justify-between">
        <span
          className={`font-mono text-[9.5px] uppercase tracking-wider ${
            status.tone === "good" ? "text-grow" : status.tone === "warn" ? "text-warn" : status.tone === "bad" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {status.label}
        </span>
        <div className="flex items-center gap-2">
          {output.qualityScore != null && <span className="font-mono text-[11px] tabular-nums text-foreground">{output.qualityScore}%</span>}
          <span className="font-mono text-[10px] text-muted-foreground">{timeAgo(output.createdAt)}</span>
        </div>
      </div>
    </CardShell>
  )
}

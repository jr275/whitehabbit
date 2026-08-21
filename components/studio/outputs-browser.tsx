"use client"

/* ------------------------------------------------------------------ *
 * Outputs browser — the concrete things the worker produced. A dense,
 * filterable ledger on the left; a full artifact preview with its
 * provenance (the capability chain that made it) on the right. An
 * output is never a mystery — you can always read what it is and see
 * why it exists.
 * ------------------------------------------------------------------ */

import { ArrowRight, FileText } from "lucide-react"
import { useMemo, useState } from "react"
import {
  CAPABILITY_META,
  type OutputArtifact,
  OUTPUT_STATUS_META,
  OUTPUT_TYPE_META,
  type OutputType,
  OUTPUTS,
  outputCountsByType,
} from "@/lib/studio-data"
import { StatusDot, Tag } from "./primitives"

type Filter = "all" | OutputType

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "lead", label: "Leads" },
  { id: "message", label: "Messages" },
  { id: "meeting", label: "Meetings" },
  { id: "crm", label: "CRM" },
  { id: "contract", label: "Contracts" },
  { id: "report", label: "Reports" },
]

export function OutputsBrowser() {
  const [filter, setFilter] = useState<Filter>("all")
  const [selectedId, setSelectedId] = useState<string>(OUTPUTS[0].id)
  const counts = useMemo(() => outputCountsByType(), [])

  const list = useMemo(
    () =>
      (filter === "all"
        ? OUTPUTS
        : OUTPUTS.filter((o) => o.type === filter)
      ).slice().sort((a, b) => b.ts - a.ts),
    [filter],
  )

  const selected =
    OUTPUTS.find((o) => o.id === selectedId) ?? list[0] ?? OUTPUTS[0]

  return (
    <div>
      {/* filter row */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-4">
        {FILTERS.map((f) => {
          const active = filter === f.id
          const count =
            f.id === "all" ? OUTPUTS.length : counts[f.id as OutputType]
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
                active
                  ? "border-primary/30 bg-primary/8 font-medium text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span className="font-mono text-[11px] tabular-nums opacity-70">
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* two-pane: ledger + preview */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_460px]">
        {/* ledger */}
        <ul className="flex flex-col gap-2">
          {list.map((o) => (
            <OutputRow
              key={o.id}
              artifact={o}
              active={o.id === selected.id}
              onClick={() => setSelectedId(o.id)}
            />
          ))}
        </ul>

        {/* preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <ArtifactPreview artifact={selected} />
        </div>
      </div>
    </div>
  )
}

function OutputRow({
  artifact,
  active,
  onClick,
}: {
  artifact: OutputArtifact
  active: boolean
  onClick: () => void
}) {
  const status = OUTPUT_STATUS_META[artifact.status]
  const type = OUTPUT_TYPE_META[artifact.type]
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full rounded-xl border bg-card p-4 text-left transition-colors ${
          active
            ? "border-primary/40 ring-1 ring-primary/20"
            : "border-border hover:border-primary/25"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag>{type.label}</Tag>
            <StatusDot tone={status.tone} label={status.label} />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {artifact.when}
          </span>
        </div>
        <h3 className="mt-2.5 text-[14px] font-medium tracking-tight text-foreground">
          {artifact.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-[12.5px] text-muted-foreground">
          {artifact.summary}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {artifact.company}
            {artifact.contact ? ` · ${artifact.contact}` : ""}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground">
            {artifact.confidence}%
          </span>
        </div>
      </button>
    </li>
  )
}

function ArtifactPreview({ artifact }: { artifact: OutputArtifact }) {
  const status = OUTPUT_STATUS_META[artifact.status]
  const type = OUTPUT_TYPE_META[artifact.type]
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      {/* header */}
      <div className="border-b border-border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag tone="primary">{type.label}</Tag>
            <StatusDot tone={status.tone} label={status.label} />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {artifact.id}
          </span>
        </div>
        <h2 className="mt-3 text-balance text-[18px] font-semibold tracking-tight text-foreground">
          {artifact.title}
        </h2>
        <p className="mt-1 font-mono text-[12px] text-muted-foreground">
          {artifact.company}
          {artifact.contact ? ` · ${artifact.contact}` : ""}
        </p>
      </div>

      {/* metrics */}
      {artifact.metrics && (
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {artifact.metrics.map((m) => (
            <div key={m.label} className="p-3.5">
              <div className="font-mono text-[15px] font-medium tabular-nums text-foreground">
                {m.value}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* artifact body */}
      <div className="p-5">
        <div className="mb-2 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Artifact
          </span>
        </div>
        <pre className="thin-scroll-light max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-4 font-mono text-[12px] leading-relaxed text-foreground">
          {artifact.body}
        </pre>
      </div>

      {/* provenance chain */}
      <div className="border-t border-border p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Provenance — capabilities that produced this
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {artifact.chain.map((cap, i) => (
            <div key={cap} className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-md border border-primary/25 bg-primary/8 px-2.5 py-1 text-[12px] font-medium text-primary">
                {CAPABILITY_META[cap].name}
              </span>
              {i < artifact.chain.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

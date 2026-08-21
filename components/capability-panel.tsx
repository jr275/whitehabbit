"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — CAPABILITY INSPECTION
 * Capabilities are first-class objects. Clicking one reveals its
 * health, version, executions, tools, knowledge and memory — plus the
 * three ways to act on it: Teach, Evolve, Trace. Secondary to the Fabric.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { Activity, Dna, GraduationCap, Search, X } from "lucide-react"
import {
  CAPABILITY_DETAIL,
  CAPABILITY_META,
  type Capability,
  type CapabilityId,
} from "@/lib/worker"

export function CapabilityPanel({
  capId,
  cap,
  onClose,
  onTeach,
  onEvolve,
  onTrace,
}: {
  capId: CapabilityId
  cap: Capability | undefined
  onClose: () => void
  onTeach: (id: CapabilityId) => void
  onEvolve: () => void
  onTrace: () => void
}) {
  const d = CAPABILITY_DETAIL[capId]
  const meta = CAPABILITY_META[capId]
  const score = cap?.score ?? d.health
  const warn = cap?.warning

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto w-[320px] overflow-hidden rounded-2xl border border-border bg-card/85 backdrop-blur-xl"
    >
      {/* header */}
      <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-foreground">{meta.name}</span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              v{d.version}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {d.category} capability
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close capability"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* health bar */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Health</span>
            <span className={`text-lg font-semibold ${warn ? "text-warn" : "text-foreground"}`}>{score}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${warn ? "bg-warn" : "bg-primary"}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* execution stats */}
        <div className="grid grid-cols-2 gap-2">
          <Metric value={d.executions.toLocaleString()} label="Executions" />
          <Metric value={`${d.successRate}%`} label="Success rate" />
        </div>

        <Section label="Tools">
          <div className="flex flex-wrap gap-1.5">
            {d.tools.map((t) => (
              <span key={t} className="rounded-md border border-border/60 px-2 py-1 font-mono text-[10px] text-foreground">
                {t}
              </span>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-2 gap-2">
          <Metric value={d.knowledgeSources.toLocaleString()} label="Knowledge" sub="sources" />
          <Metric value={d.memorySignals.toLocaleString()} label="Memory" sub="signals" />
        </div>

        {/* actions */}
        <div className="flex items-center gap-2 pt-1">
          <ActionBtn icon={GraduationCap} label="Teach" onClick={() => onTeach(capId)} primary />
          <ActionBtn icon={Dna} label="Evolve" onClick={onEvolve} />
          <ActionBtn icon={Search} label="Trace" onClick={onTrace} />
        </div>
      </div>
    </motion.div>
  )
}

function Metric({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
        {sub ? ` · ${sub}` : ""}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
        primary
          ? "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          : "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

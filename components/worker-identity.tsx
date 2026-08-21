"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — WORKER IDENTITY LAYER
 * Emerges when the user clicks the Worker Core. Not a profile page —
 * the identity is embedded in the worker itself. A compact identity
 * header opens into the deeper worker (knowledge, memory, policies,
 * permissions, versions, health) on demand. Never a permanent sidebar.
 * ------------------------------------------------------------------ */

import { AnimatePresence, motion } from "framer-motion"
import { Dna, GraduationCap, X } from "lucide-react"
import { useState } from "react"
import {
  HEALTH_FACTORS,
  IDENTITY,
  KNOWLEDGE_GROUPS,
  MEMORY_SIGNALS,
  PERMISSIONS,
  POLICIES,
  VERSIONS,
  HISTORY_24H,
  type PermissionLevel,
  type WorkerStatus,
} from "@/lib/worker"

const STATUS_LABEL: Record<WorkerStatus, string> = {
  draft: "Draft",
  building: "Building",
  ready: "Ready",
  live: "Live",
  thinking: "Thinking",
  working: "Working",
  waiting: "Waiting",
  blocked: "Blocked",
  awaiting_approval: "Awaiting approval",
  idle: "Idle",
  evolving: "Evolving",
  error: "Error",
}

type DeepTab = "knowledge" | "memory" | "policies" | "permissions" | "versions" | "health"
const TABS: { id: DeepTab; label: string }[] = [
  { id: "knowledge", label: "Knowledge" },
  { id: "memory", label: "Memory" },
  { id: "policies", label: "Policies" },
  { id: "permissions", label: "Permissions" },
  { id: "versions", label: "Versions" },
  { id: "health", label: "Health" },
]

const PERM_TONE: Record<PermissionLevel, string> = {
  allowed: "text-grow",
  approval: "text-warn",
  blocked: "text-destructive",
}
const PERM_LABEL: Record<PermissionLevel, string> = {
  allowed: "Allowed",
  approval: "Approval required",
  blocked: "Blocked",
}

export function WorkerIdentity({
  status,
  activeCount,
  autonomy,
  onClose,
  onTeach,
  onEvolve,
}: {
  status: WorkerStatus
  activeCount: number
  autonomy: number
  onClose: () => void
  onTeach: () => void
  onEvolve: () => void
}) {
  const [deep, setDeep] = useState(false)
  const [tab, setTab] = useState<DeepTab>("knowledge")

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto w-[340px] overflow-hidden rounded-2xl border border-border bg-card/85 backdrop-blur-xl"
    >
      {/* header */}
      <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-foreground">{IDENTITY.name}</span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              v{IDENTITY.version}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {IDENTITY.role}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close worker identity"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* objective + live state */}
      <div className="space-y-4 px-5 py-4">
        <Field label="Objective">
          <p className="text-pretty text-[13px] leading-relaxed text-foreground">{IDENTITY.objective}</p>
        </Field>

        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "working" ? "animate-blink bg-grow" : status === "awaiting_approval" ? "bg-warn" : status === "thinking" ? "animate-pulse bg-primary" : "bg-muted-foreground"
            }`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
            {STATUS_LABEL[status]}
          </span>
        </div>

        {/* the operational numbers that matter */}
        <div className="grid grid-cols-4 gap-2">
          <Stat value={String(IDENTITY.maturity)} label="Maturity" accent />
          <Stat value={`${autonomy}`} label="Autonomy" />
          <Stat value={`${IDENTITY.reliability}`} label="Reliab." />
          <Stat value={String(activeCount)} label="Active" />
        </div>

        {/* actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeep((v) => !v)}
            className="flex-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary transition-colors hover:bg-primary/20"
          >
            {deep ? "Hide worker" : "View worker"}
          </button>
          <IconBtn icon={GraduationCap} onClick={onTeach} label="Teach" />
          <IconBtn icon={Dna} onClick={onEvolve} label="Evolve" />
        </div>
      </div>

      {/* deeper worker — dense, structured, revealed on demand */}
      <AnimatePresence initial={false}>
        {deep && (
          <motion.div
            key="deep"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-border/60 bg-background/40"
          >
            {/* tab rail */}
            <div className="flex flex-wrap gap-1 px-4 pt-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] transition-colors ${
                    tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="max-h-64 overflow-y-auto px-5 py-4">
              {tab === "knowledge" && (
                <div className="space-y-3">
                  <Caption>{"1,284 sources · what the worker knows about the world"}</Caption>
                  <div className="grid grid-cols-2 gap-2">
                    {KNOWLEDGE_GROUPS.map((g) => (
                      <div key={g.label} className="flex items-baseline justify-between rounded-lg border border-border/60 px-3 py-2">
                        <span className="text-[12px] text-foreground">{g.label}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{g.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "memory" && (
                <div className="space-y-3">
                  <Caption>{`${MEMORY_SIGNALS.length} recent signals · what it learned from experience`}</Caption>
                  {MEMORY_SIGNALS.map((m) => (
                    <div key={m.id} className="rounded-lg border border-border/60 px-3 py-2">
                      <p className="text-[12px] leading-snug text-foreground">{m.text}</p>
                      <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                        <span>{m.source}</span>
                        <span className="text-grow">{m.confidence}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "policies" && (
                <div className="space-y-2">
                  <Caption>What the worker should do</Caption>
                  {POLICIES.map((p) => (
                    <div key={p} className="flex gap-2 rounded-lg border border-border/60 px-3 py-2">
                      <span className="mt-1 h-1 w-1 flex-none rounded-full bg-primary" />
                      <span className="text-[12px] leading-snug text-foreground">{p}</span>
                    </div>
                  ))}
                </div>
              )}

              {tab === "permissions" && (
                <div className="space-y-1.5">
                  <Caption>What it can do vs must ask</Caption>
                  {PERMISSIONS.map((p) => (
                    <div key={p.action} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                      <span className="text-[12px] text-foreground">{p.action}</span>
                      <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${PERM_TONE[p.level]}`}>
                        {PERM_LABEL[p.level]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {tab === "versions" && (
                <div className="space-y-2">
                  <Caption>Evolution history</Caption>
                  {VERSIONS.map((v, i) => (
                    <div key={v.version} className="rounded-lg border border-border/60 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-foreground">v{v.version}</span>
                        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                          {i === 0 ? "current" : v.when}
                        </span>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {v.changes.map((c) => (
                          <li key={c} className="text-[11px] leading-snug text-muted-foreground">
                            {"· "}
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {tab === "health" && (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-foreground">{IDENTITY.health}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Worker health</span>
                  </div>
                  <div className="space-y-1.5">
                    {HEALTH_FACTORS.map((f) => (
                      <div key={f.label} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                        <span className="text-[12px] text-foreground">{f.label}</span>
                        <span className={`font-mono text-[11px] ${f.good ? "text-grow" : "text-warn"}`}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <MiniStat value={HISTORY_24H.tasks} label="Tasks 24h" />
                    <MiniStat value={HISTORY_24H.completed} label="Completed" />
                    <MiniStat value={HISTORY_24H.failed} label="Failed" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 px-2 py-2 text-center">
      <div className={`text-base font-semibold ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
    </div>
  )
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-2 py-1.5 text-center">
      <div className="text-[13px] font-semibold text-foreground">{value}</div>
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  )
}

function Caption({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/80">{children}</div>
}

function IconBtn({ icon: Icon, onClick, label }: { icon: React.ElementType; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-lg border border-border px-2.5 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

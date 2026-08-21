"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — LIVE TASK HUD
 * A small glass panel that floats above the fabric while a task runs.
 * Answers one question at a glance: "what is my worker doing right
 * now?" — current action, the capability in play, live metrics, and a
 * narrative that unfolds as the work happens. Never a giant card.
 * ------------------------------------------------------------------ */

import { AnimatePresence, motion } from "framer-motion"
import { Crosshair, Locate, RotateCcw, Play } from "lucide-react"
import { CAPABILITY_META } from "@/lib/worker"
import type { ExecutionState } from "@/lib/simulation"
import type { WorkerStatus } from "@/lib/worker"

const STATUS_LABEL: Record<WorkerStatus, string> = {
  draft: "Draft",
  building: "Building",
  ready: "Ready",
  live: "Live",
  working: "Working",
  idle: "Idle",
  thinking: "Thinking",
  waiting: "Waiting",
  blocked: "Blocked",
  awaiting_approval: "Awaiting approval",
  evolving: "Evolving",
  error: "Error",
}

export function TaskHud({
  exec,
  workerStatus,
  narrative,
  autoFollow,
  onToggleFollow,
  onRecenter,
  onRunDemo,
  onReset,
}: {
  exec: ExecutionState | null
  workerStatus: WorkerStatus
  narrative: { id: number; text: string }[]
  autoFollow: boolean
  onToggleFollow: () => void
  onRecenter: () => void
  onRunDemo: () => void
  onReset: () => void
}) {
  const working = workerStatus === "working"
  const thinking = workerStatus === "thinking"
  const awaiting = workerStatus === "awaiting_approval"
  const dotClass = working
    ? "bg-grow animate-blink"
    : thinking
      ? "bg-primary animate-pulse"
      : awaiting
        ? "bg-warn animate-blink"
        : "bg-muted-foreground"

  return (
    <motion.aside
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="pointer-events-auto w-[300px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl"
    >
      {/* status strip */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
          {STATUS_LABEL[workerStatus]}
        </div>
        {exec && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            #{exec.taskId}
          </span>
        )}
      </div>

      {exec ? (
        <div className="px-4 py-3.5">
          {/* objective */}
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {exec.kind === "qualify" ? "Qualifying" : exec.kind === "contract" ? "Contracting" : "Mapping"}
          </p>
          <p className="mt-1 text-pretty text-[15px] font-medium leading-snug tracking-tight">
            {exec.company}
          </p>

          {/* current action */}
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-2">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="truncate text-[12px] text-foreground">{exec.currentAction}</span>
          </div>

          {/* current capability */}
          {exec.currentCapability && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Step · <span className="text-primary">{CAPABILITY_META[exec.currentCapability].name}</span>
            </p>
          )}

          {/* metrics */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
            <Metric value={exec.metrics.sources} label="Sources" />
            <Metric value={exec.metrics.evidence} label="Evidence" />
            <Metric value={`${Math.round(exec.metrics.confidence)}%`} label="Confidence" />
          </div>

          {/* narrative */}
          {narrative.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
              <AnimatePresence initial={false}>
                {narrative.map((n, i) => (
                  <motion.li
                    key={n.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: i === narrative.length - 1 ? 1 : 0.5, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-baseline gap-2 text-[11px] leading-snug"
                  >
                    <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-grow/70" />
                    <span className={i === narrative.length - 1 ? "text-foreground" : "text-muted-foreground"}>
                      {n.text}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      ) : (
        <div className="px-4 py-5 text-[12px] text-muted-foreground">
          Worker idle — awaiting the next task.
        </div>
      )}

      {/* controls */}
      <div className="flex items-center gap-1 border-t border-border/70 px-2.5 py-2">
        <ToggleBtn active={autoFollow} onClick={onToggleFollow} icon={Locate} label="Auto-follow" />
        <IconBtn onClick={onRecenter} icon={Crosshair} label="Recenter camera" />
        <div className="ml-auto flex items-center gap-1">
          <IconBtn onClick={onRunDemo} icon={Play} label="Run demo" />
          <IconBtn onClick={onReset} icon={RotateCcw} label="Reset" />
        </div>
      </div>
    </motion.aside>
  )
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[16px] leading-none tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function ToggleBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  )
}

function IconBtn({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

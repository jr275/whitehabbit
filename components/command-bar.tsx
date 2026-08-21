"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — COMMAND BAR
 * A universal interface to the worker. Its placeholder and behavior
 * change with context. In Rabbit Hole it filters events; elsewhere it
 * routes natural language into Grow / Teach.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { Dna, GraduationCap, Plus } from "lucide-react"
import { useState } from "react"
import type { FabricMode } from "@/lib/worker"

const PLACEHOLDER: Record<FabricMode, string> = {
  outcome: "Ask about outcomes…",
  fabric: "Ask your worker anything — why, what, teach, grow…",
  watch: "Ask why · what it learned · what's next…",
  trace: "Search execution events…",
}

export function CommandBar({
  mode,
  traceQuery,
  onTraceQuery,
  onGrow,
  onTeach,
  onEvolve,
  onExplain,
}: {
  mode: FabricMode
  traceQuery: string
  onTraceQuery: (q: string) => void
  onGrow: () => void
  onTeach: (seed: string) => void
  onEvolve: () => void
  onExplain: (q: string) => void
}) {
  const [value, setValue] = useState("")

  const submit = () => {
    const v = value.trim()
    if (!v) return
    if (/^(add|grow|new capability)/i.test(v)) onGrow()
    // questions & operational intents route into the explainability layer
    else if (/^(why|what|how|explain|show me|stop|pause|halt|connect|improve|make it better|run a)/i.test(v))
      onExplain(v)
    else onTeach(v)
    setValue("")
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-2 backdrop-blur-md"
    >
      <input
        value={mode === "trace" ? traceQuery : value}
        onChange={(e) =>
          mode === "trace" ? onTraceQuery(e.target.value) : setValue(e.target.value)
        }
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === "Enter" && mode !== "trace") submit()
        }}
        placeholder={PLACEHOLDER[mode]}
        className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/70"
        aria-label="Command bar"
      />
      {mode !== "trace" && (
        <div className="flex items-center gap-1">
          <CmdButton icon={Plus} label="Grow" onClick={onGrow} />
          <CmdButton icon={GraduationCap} label="Teach" onClick={() => onTeach("")} />
          <CmdButton icon={Dna} label="Evolve" onClick={onEvolve} />
        </div>
      )}
    </motion.div>
  )
}

function CmdButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — MODE SWITCHER
 * Zoom levels, not tabs: OUTCOME (meaning) -> FABRIC (operation) ->
 * WATCH (execution) -> RABBIT HOLE (internals). The deeper you go, the
 * more technical the interface becomes.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import type { FabricMode } from "@/lib/worker"

const MODES: { id: FabricMode; label: string }[] = [
  { id: "outcome", label: "Outcome" },
  { id: "fabric", label: "Fabric" },
  { id: "watch", label: "Watch" },
  { id: "trace", label: "Rabbit Hole" },
]

export function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: FabricMode
  onChange: (m: FabricMode) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/70 p-1 backdrop-blur-md"
    >
      {MODES.map((m) => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className="relative rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors"
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className={`relative ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m.label}
            </span>
          </button>
        )
      })}
    </motion.div>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — EVOLVE
 * Not a number going up. The worker becomes structurally more capable:
 * a new skill orb, richer connections. The score is secondary; the
 * physical transformation of the fabric is the point.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { Check, Dna } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { type Capability, CAPABILITY_META } from "@/lib/worker"
import { DrawerShell } from "./teach-drawer"

type Stage = "analyzing" | "proposed" | "simulating" | "applied"

const GAIN = 14

export function EvolveDrawer({
  caps,
  onClose,
  onApply,
}: {
  caps: Capability[]
  onClose: () => void
  onApply: (capId: Capability["id"], nextScore: number) => void
}) {
  const [stage, setStage] = useState<Stage>("analyzing")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // weakest capability is the evolution candidate
  const target = [...caps].sort((a, b) => a.score - b.score)[0]
  const nextScore = Math.min(100, target.score + GAIN)

  useEffect(() => {
    timers.current.push(setTimeout(() => setStage("proposed"), 1300))
    return () => timers.current.forEach(clearTimeout)
  }, [])

  const simulate = () => {
    setStage("simulating")
    timers.current.push(
      setTimeout(() => {
        setStage("applied")
        onApply(target.id, nextScore)
      }, 1200),
    )
    timers.current.push(setTimeout(onClose, 2600))
  }

  return (
    <DrawerShell title="Evolve your worker" onClose={onClose}>
      {stage === "analyzing" && (
        <div className="flex items-center gap-3 py-6">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-primary" />
          <span className="font-mono text-[13px] uppercase tracking-[0.3em] text-foreground">
            Analyzing capabilities
          </span>
        </div>
      )}

      {(stage === "proposed" || stage === "simulating") && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Recommended evolution
          </p>
          <div className="mt-3 rounded-xl border border-border p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-medium tracking-tight">{target.name}</span>
              <span className="font-mono text-[13px]">
                <span className="text-muted-foreground">{target.score}</span>
                <span className="mx-1.5 text-border">→</span>
                <span className="text-grow">{nextScore}</span>
              </span>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {CAPABILITY_META[target.id].blurb}
            </p>
            {/* structural preview: the physical change */}
            <div className="mt-4 flex items-center gap-4">
              <StructurePreview orbs={target.orbs} />
              <span className="text-border">→</span>
              <StructurePreview orbs={target.orbs + 1} highlight />
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              +1 skill orb · richer connections
            </p>
          </div>
          <button
            onClick={simulate}
            disabled={stage === "simulating"}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-60"
          >
            {stage === "simulating" ? "Simulating…" : "Simulate change"}
            <Dna className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}

      {stage === "applied" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="py-4"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-grow/20">
              <Check className="h-3.5 w-3.5 text-grow" />
            </span>
            <span className="font-mono text-[13px] uppercase tracking-[0.3em] text-grow">
              Evolution applied
            </span>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            {target.name} matured to <span className="text-foreground">{nextScore}</span>. Watch the
            fabric make room for the new structure.
          </p>
        </motion.div>
      )}
    </DrawerShell>
  )
}

function StructurePreview({ orbs, highlight }: { orbs: number; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-4 w-4 rounded-full ${highlight ? "bg-primary" : "bg-primary/70"}`} />
      {Array.from({ length: orbs }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${
            highlight && i === orbs - 1 ? "bg-grow" : "bg-muted-foreground/50"
          }`}
        />
      ))}
    </div>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — CREATE + ASSEMBLE
 * The first thing the user sees is not a worker. It is an invitation
 * to create one. Their intention becomes the worker.
 * ------------------------------------------------------------------ */

import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { useState } from "react"

export const ASSEMBLY_STEPS: { text: string; reveal: number }[] = [
  { text: "ANALYZING OBJECTIVE", reveal: 0 },
  { text: "UNDERSTANDING INTENT", reveal: 1 },
  { text: "IDENTIFYING CAPABILITIES", reveal: 1 },
  { text: "RESEARCH DETECTED", reveal: 2 },
  { text: "REASONING DETECTED", reveal: 3 },
  { text: "COMMUNICATION DETECTED", reveal: 4 },
  { text: "EXECUTION DETECTED", reveal: 5 },
  { text: "MEMORY DETECTED", reveal: 6 },
  { text: "ASSEMBLING WORKER", reveal: 999 },
]

export function CreateOverlay({
  phase,
  assemblyStep,
  objective,
  onAssemble,
}: {
  phase: "create" | "assembling" | "live"
  assemblyStep: number
  objective: string
  onAssemble: (objective: string) => void
}) {
  const [value, setValue] = useState("")

  if (phase === "live") return null

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
      <AnimatePresence mode="wait">
        {phase === "create" ? (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-2xl text-center"
          >
            <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
              WhiteHabbit
            </p>
            <h1 className="text-balance text-4xl font-medium tracking-tight sm:text-5xl">
              What should your worker do?
            </h1>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const v = value.trim()
                if (v) onAssemble(v)
              }}
              className="mx-auto mt-10 w-full max-w-xl"
            >
              <div className="group flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4 backdrop-blur-sm transition-colors focus-within:border-primary/60">
                <input
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  }}
                  placeholder="Find high-quality enterprise leads and book qualified meetings."
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
                  aria-label="Worker objective"
                />
              </div>
              <button
                type="submit"
                disabled={!value.trim()}
                className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-primary-foreground transition-opacity disabled:opacity-30"
              >
                Assemble worker
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="assembling"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8 } }}
            className="flex w-full max-w-xl flex-col items-center text-center"
          >
            <p className="mb-8 max-w-md text-pretty text-sm text-muted-foreground">
              &ldquo;{objective}&rdquo;
            </p>
            <div className="relative h-6 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={assemblyStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="font-mono text-[13px] uppercase tracking-[0.3em] text-foreground"
                >
                  {ASSEMBLY_STEPS[Math.min(assemblyStep, ASSEMBLY_STEPS.length - 1)]?.text}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="mt-6 flex gap-1.5">
              {ASSEMBLY_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-1 rounded-full transition-colors duration-300 ${
                    i <= assemblyStep ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

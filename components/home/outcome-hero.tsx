"use client"

/* ------------------------------------------------------------------ *
 * OUTCOME HERO — the front door.
 * You don't configure a tool here. You state a business outcome, and a
 * workforce is assembled to own it. One input, load-bearing.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import { useState } from "react"

const EXAMPLES = [
  "Grow qualified pipeline without raising blended CAC",
  "Launch into two new segments this quarter",
  "Cut wasted ad spend and reinvest into winners",
  "Turn our content into a compounding demand engine",
]

export function OutcomeHero({ onAssemble }: { onAssemble: (outcome: string) => void }) {
  const [value, setValue] = useState("")

  function submit(v: string) {
    const outcome = v.trim()
    if (!outcome) return
    onAssemble(outcome)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6">
      {/* ambient field */}
      <div className="pointer-events-none absolute inset-0 bg-substrate opacity-70" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center"
      >
        <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Menlo Whitehabbit — AI Workforce
          </span>
        </span>

        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          What should your workforce accomplish?
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          Don&apos;t assemble tools or wire workflows. State the outcome you want to own — a division
          of AI workers assembles around it, each with skills it treats as proprietary and judgment it
          learns from the work.
        </p>

        {/* the one input */}
        <div className="mt-9 w-full max-w-2xl">
          <div className="group relative flex items-center rounded-2xl border border-input bg-card/70 p-2 backdrop-blur transition-colors focus-within:border-primary/60">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  submit(value)
                }
              }}
              rows={2}
              placeholder="e.g. Grow qualified pipeline while holding blended CAC flat"
              className="flex-1 resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <button
              onClick={() => submit(value)}
              disabled={!value.trim()}
              className="mr-1 inline-flex h-11 shrink-0 items-center gap-2 self-end rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Assemble workforce
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* outcome examples */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setValue(ex)
                  submit(ex)
                }}
                className="rounded-full border border-border bg-card/40 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

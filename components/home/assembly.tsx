"use client"

/* ------------------------------------------------------------------ *
 * ASSEMBLY — the workforce forms around the stated outcome.
 * A lead is placed at the center; specialists resolve into a ring and
 * connect to it, each announced by role. Narration explains what is
 * happening. Ends by handing off to the Observatory.
 * ------------------------------------------------------------------ */

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import { WORKERS } from "@/lib/workforce-demo/seed"

const NARRATION = [
  "Reading your outcome…",
  "Placing a lead to own it end-to-end…",
  "Assembling specialists around the outcome…",
  "Wiring the reporting line…",
  "Loading each worker's skills and learned judgment…",
  "Your division is live.",
]

export function Assembly({ outcome, onComplete }: { outcome: string; onComplete: () => void }) {
  const lead = useMemo(() => WORKERS.find((w) => w.role === "lead")!, [])
  const specialists = useMemo(() => WORKERS.filter((w) => w.role === "specialist"), [])
  const [line, setLine] = useState(0)
  const [revealed, setRevealed] = useState(0) // specialists revealed

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    // narration cadence
    NARRATION.forEach((_, i) => {
      timers.push(setTimeout(() => setLine(i), 350 + i * 900))
    })
    // specialist reveal cadence (starts after the lead lands)
    specialists.forEach((_, i) => {
      timers.push(setTimeout(() => setRevealed(i + 1), 1500 + i * 320))
    })
    // hand off
    timers.push(setTimeout(onComplete, 350 + NARRATION.length * 900 + 700))
    return () => timers.forEach(clearTimeout)
  }, [specialists, onComplete])

  const R = 168
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div className="pointer-events-none absolute inset-0 bg-substrate opacity-70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[130px]" />

      {/* outcome pinned above */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mb-10 max-w-xl text-center"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Assembling a workforce to own</div>
        <div className="mt-2 text-pretty text-lg font-medium text-foreground sm:text-xl">&ldquo;{outcome}&rdquo;</div>
      </motion.div>

      {/* the forming org */}
      <div className="relative z-10 h-[380px] w-[380px]">
        {/* connectors */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 380">
          {specialists.map((s, i) => {
            const angle = (i / specialists.length) * Math.PI * 2 - Math.PI / 2
            const x = 190 + Math.cos(angle) * R
            const y = 190 + Math.sin(angle) * R
            const on = i < revealed
            return (
              <motion.line
                key={s.id}
                x1={190}
                y1={190}
                x2={x}
                y2={y}
                stroke={on ? "var(--primary)" : "transparent"}
                strokeWidth={1}
                strokeOpacity={0.35}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: on ? 1 : 0 }}
                transition={{ duration: 0.5 }}
              />
            )
          })}
        </svg>

        {/* lead core */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "backOut" }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-[15px] font-bold text-white shadow-lg"
            style={{ backgroundColor: lead.accent, boxShadow: `0 0 40px ${lead.accent}66` }}
          >
            {lead.initials}
          </div>
        </motion.div>

        {/* specialists */}
        {specialists.map((s, i) => {
          const angle = (i / specialists.length) * Math.PI * 2 - Math.PI / 2
          const x = 190 + Math.cos(angle) * R
          const y = 190 + Math.sin(angle) * R
          const on = i < revealed
          return (
            <motion.div
              key={s.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={on ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
              transition={{ duration: 0.45, ease: "backOut" }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: x, top: y }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-[12px] font-bold text-white"
                  style={{ backgroundColor: s.accent, boxShadow: `0 0 22px ${s.accent}55` }}
                >
                  {s.initials}
                </div>
                <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {s.name}
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* narration */}
      <div className="relative z-10 mt-10 h-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="font-mono text-[12px] tracking-wide text-primary"
          >
            {NARRATION[line]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}

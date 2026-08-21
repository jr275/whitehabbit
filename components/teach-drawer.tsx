"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — TEACH
 * Not a settings form. A conversation. You tell the worker what to do
 * differently; it proposes a policy; you apply it; the fabric matures.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { ArrowRight, Check, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { CAPABILITY_META, type CapabilityId } from "@/lib/worker"

type Stage = "ask" | "understanding" | "proposed" | "applied"

const TARGET: CapabilityId = "reasoning"

export function TeachDrawer({
  seed,
  onClose,
  onApply,
}: {
  seed: string
  onClose: () => void
  onApply: (capId: CapabilityId) => void
}) {
  const [stage, setStage] = useState<Stage>("ask")
  const [text, setText] = useState(seed)
  const [understandLine, setUnderstandLine] = useState("UNDERSTANDING")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const submit = () => {
    if (!text.trim()) return
    setStage("understanding")
    timers.current.push(setTimeout(() => setUnderstandLine("BEHAVIOR IDENTIFIED"), 900))
    timers.current.push(setTimeout(() => setStage("proposed"), 1700))
  }

  const apply = () => {
    setStage("applied")
    onApply(TARGET)
    timers.current.push(setTimeout(onClose, 1600))
  }

  return (
    <DrawerShell title="Teach your worker" onClose={onClose}>
      {stage === "ask" && (
        <div>
          <p className="text-[15px] text-foreground">What should it do differently?</p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
            }}
            rows={2}
            placeholder="For enterprise companies, prioritize VP and Director-level contacts over managers."
            className="mt-3 w-full resize-none rounded-xl border border-border bg-background/60 px-4 py-3 text-[14px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
          />
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-30"
          >
            Understand <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {stage === "understanding" && (
        <div className="flex items-center gap-3 py-6">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-primary" />
          <span className="font-mono text-[13px] uppercase tracking-[0.3em] text-foreground">
            {understandLine}
          </span>
        </div>
      )}

      {stage === "proposed" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Policy proposed
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <PolicyRow segment="Enterprise" role="VP / Director" priority="High" tone="grow" />
            <PolicyRow segment="Enterprise" role="Manager" priority="Medium" tone="muted" />
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Matures <span className="text-foreground">{CAPABILITY_META[TARGET].name}</span> — its
            decision policy gains a new rule and a skill orb.
          </p>
          <button
            onClick={apply}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground"
          >
            Apply teaching <Check className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}

      {stage === "applied" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 py-6"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-grow/20">
            <Check className="h-3.5 w-3.5 text-grow" />
          </span>
          <span className="font-mono text-[13px] uppercase tracking-[0.3em] text-grow">
            Policy updated
          </span>
        </motion.div>
      )}
    </DrawerShell>
  )
}

function PolicyRow({
  segment,
  role,
  priority,
  tone,
}: {
  segment: string
  role: string
  priority: string
  tone: "grow" | "muted"
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2 font-mono text-[12px]">
        <span className="text-muted-foreground">{segment}</span>
        <span className="text-border">→</span>
        <span className="text-foreground">{role}</span>
      </div>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
          tone === "grow" ? "text-grow" : "text-muted-foreground"
        }`}
      >
        {priority}
      </span>
    </div>
  )
}

export function DrawerShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-card/90 p-5 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground">{title}</h2>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </motion.div>
  )
}

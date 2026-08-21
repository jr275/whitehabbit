"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — EXPLAINABILITY
 * The worker can always answer "why?". Not a chatbot — an explainability
 * layer over worker state. Deterministic intents map a question to a
 * contextual, causal answer, optionally spotlighting the fabric.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { CornerDownRight, X } from "lucide-react"
import type { ExplainAnswer } from "@/lib/worker"

export function ExplainPanel({
  answer,
  onClose,
  onCta,
}: {
  answer: ExplainAnswer
  onClose: () => void
  onCta?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto w-[400px] max-w-[86vw] overflow-hidden rounded-2xl border border-primary/30 bg-card/90 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <span className="text-pretty text-[13px] font-semibold text-foreground">{answer.title}</span>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close explanation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 px-5 py-4">
        <ul className="space-y-2">
          {answer.lines.map((l, i) => (
            <motion.li
              key={l}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.3 }}
              className="flex gap-2 text-[13px] leading-relaxed text-foreground"
            >
              <CornerDownRight className="mt-0.5 h-3.5 w-3.5 flex-none text-primary/70" />
              <span>{l}</span>
            </motion.li>
          ))}
        </ul>

        <div className="flex items-center justify-between pt-1">
          {answer.confidence !== undefined ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Confidence <span className="text-grow">{answer.confidence}%</span>
            </span>
          ) : (
            <span />
          )}
          {answer.cta && onCta && (
            <button
              onClick={onCta}
              className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-primary transition-colors hover:bg-primary/20"
            >
              {answer.cta}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — HUMAN APPROVAL
 * The worker prepared something policy won't let it send alone. It
 * pauses and waits for its manager. This is the most important
 * emotional interaction in the product — the worker deferring to you.
 * ------------------------------------------------------------------ */

import { motion } from "framer-motion"
import { Check, ShieldAlert, X } from "lucide-react"
import type { Approval } from "@/lib/simulation"

export function ApprovalPanel({
  approval,
  onApprove,
  onReject,
}: {
  approval: Approval
  onApprove: () => void
  onReject: () => void
}) {
  const short = approval.company.split(" ")[0]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 10 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto w-[380px] overflow-hidden rounded-2xl border border-warn/40 bg-card/90 backdrop-blur-xl"
      style={{ boxShadow: "0 0 0 1px rgba(230,176,82,0.12), 0 20px 60px -20px rgba(230,176,82,0.35)" }}
      role="alertdialog"
      aria-label="Approval required"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
        <ShieldAlert className="h-4 w-4 text-warn" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-warn">Approval required</span>
        <motion.span
          className="ml-auto h-1.5 w-1.5 rounded-full bg-warn"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
        />
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="text-[14px] leading-relaxed text-foreground">{approval.summary}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">Value</div>
            <div className="mt-0.5 text-lg font-semibold text-foreground">{approval.value}</div>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">Confidence</div>
            <div className="mt-0.5 text-lg font-semibold text-grow">{approval.confidence}%</div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <span className="mt-1 h-1 w-1 flex-none rounded-full bg-warn" />
          <span className="text-[12px] leading-snug text-muted-foreground">
            Policy: {approval.policy.toLowerCase()} before sending to {short}.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onApprove}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-grow/40 bg-grow/15 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] text-grow transition-colors hover:bg-grow/25"
          >
            <Check className="h-4 w-4" />
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Reject
          </button>
        </div>
      </div>
    </motion.div>
  )
}

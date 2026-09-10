"use client"

/* ================================================================== *
 * VOICE — an input modality, rendered as one.
 *
 * The whole design argument of this panel is the middle row: it shows
 * WHAT YOU SAID and then WHAT IT WAS UNDERSTOOD AS, in the vocabulary
 * of capabilities Knowledge already has (ASK → KNOWLEDGE). A person
 * should be able to watch speech become an existing product action.
 * That is what stops voice reading as a second assistant with its own
 * powers — there is visibly nothing on the far side of it except Ask,
 * Search and Research.
 *
 * This is the VISUAL layer only. The real capability lives in
 * lib/knowledge/voice-search.ts (Web Speech API, browser-native, no
 * audio or transcript persisted); this panel drives the same state
 * names so the two can be joined without redesigning either.
 * ================================================================== */

import { useEffect, useRef } from "react"
import type { VoiceController } from "@/lib/knowledge/understand/hooks"
import { usePrefersReducedMotion } from "@/lib/knowledge/understand/use-reveal"
import { cn } from "@/lib/utils"
import { Label } from "../shell/section"

const SAMPLES = [
  "What do I know about AI agents?",
  "Find what I saved about MCP",
  "Research how agents handle memory",
]

const STATUS_COPY: Record<VoiceController["status"], string> = {
  idle: "Ready",
  listening: "Listening",
  processing: "Working out what you meant",
  understood: "Understood",
  answering: "Answering from your library",
  error: "Didn't catch that",
}

function VoiceOrb({ status }: { status: VoiceController["status"] }) {
  const reduced = usePrefersReducedMotion()
  const live = status === "listening"
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition-colors duration-[var(--kp-fast)]",
        live ? "border-[var(--kp-accent)]" : "border-[var(--kp-rule-strong)]",
      )}
    >
      <span
        className={cn(
          "block rounded-full transition-all duration-[var(--kp-fast)]",
          live ? "h-4 w-4 bg-[var(--kp-accent)]" : "h-2.5 w-2.5 bg-[var(--kp-ink-faint)]",
          // The pulse is the ONE looping animation on the page, it runs
          // only while actually listening, and reduced motion drops it.
          live && !reduced && "animate-pulse",
        )}
      />
    </span>
  )
}

export function KnowledgeVoiceLayer({
  voice,
  onClose,
  onAsk,
}: {
  voice: VoiceController
  onClose: () => void
  onAsk: (question: string) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const handled = useRef<string | null>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // When the intent resolves to a question, hand it to the REAL Ask
  // surface rather than answering here. Voice owns no results.
  useEffect(() => {
    if (voice.status !== "answering" || !voice.transcript) return
    if (handled.current === voice.transcript) return
    handled.current = voice.transcript
    if (voice.intent === "ask" || voice.intent === "search") {
      onAsk(voice.transcript)
      onClose()
    }
  }, [voice.status, voice.intent, voice.transcript, onAsk, onClose])

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:bottom-6 sm:right-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Voice"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
        className="kp-understand border-t border-[var(--kp-rule-strong)] bg-[var(--kp-paper-raised)] p-5 shadow-[0_-6px_30px_oklch(0.19_0.012_260_/_12%)] focus:outline-none sm:w-[min(24rem,92vw)] sm:rounded-2xl sm:border sm:shadow-[0_12px_40px_oklch(0.19_0.012_260_/_16%)]"
      >
        <div className="flex items-center justify-between gap-3">
          <Label>Voice</Label>
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] text-[var(--kp-ink-faint)] transition-colors hover:text-[var(--kp-ink)]"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <VoiceOrb status={voice.status} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium" aria-live="polite">
              {STATUS_COPY[voice.status]}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--kp-ink-faint)]">
              Speech stays in your browser. Nothing is recorded.
            </p>
          </div>
        </div>

        {voice.transcript && (
          <div className="mt-5">
            <Label>You said</Label>
            <p className="mt-1.5 font-[family-name:var(--font-fraunces)] text-[16px] leading-snug">
              “{voice.transcript}”
            </p>
          </div>
        )}

        {voice.routedTo && (
          <div className="mt-4">
            <Label>Keeply understood</Label>
            <p
              className={cn(
                "kp-tnum mt-1.5 text-[13px] font-semibold uppercase tracking-[0.12em]",
                voice.intent === "unknown" ? "text-[var(--kp-ink-faint)]" : "text-[var(--kp-accent)]",
              )}
            >
              {voice.routedTo}
            </p>
          </div>
        )}

        {voice.error && <p className="mt-3 text-[13px] text-[var(--kp-ink-soft)]">{voice.error}</p>}

        {(voice.status === "idle" || voice.status === "error") && (
          <div className="mt-5">
            <Label>Try saying</Label>
            <ul className="mt-2 space-y-1.5">
              {SAMPLES.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => voice.simulate(s)}
                    className="w-full text-left text-[13.5px] leading-snug text-[var(--kp-ink-soft)] transition-colors hover:text-[var(--kp-accent)]"
                  >
                    “{s}”
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11.5px] leading-relaxed text-[var(--kp-ink-faint)]">
              Prototype: these play back the interface states. Live dictation runs on the browser&rsquo;s own speech
              recognition in the Library.
            </p>
          </div>
        )}

        {voice.status !== "idle" && voice.status !== "error" && (
          <button
            type="button"
            onClick={voice.cancel}
            className="mt-5 text-[12.5px] text-[var(--kp-ink-faint)] underline-offset-4 hover:text-[var(--kp-ink)] hover:underline"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

"use client"

import { Loader2, Mic, MicOff } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UseVoiceSearchResult } from "@/lib/knowledge/use-voice-search"

/** The mic control itself — one button, its appearance IS the state.
 *  Click behavior: idle/success/permission-denied/error/unsupported →
 *  start() (try again is just trying again); requesting/listening →
 *  stop() (the cancel affordance); processing is momentary and the
 *  button is disabled for it, so there's nothing to cancel mid-flight.
 *
 *  Positioning is left to the caller via `className` so the same control
 *  can sit absolutely inside the Library search field or inline in the
 *  command-palette input row — the visual/state logic is identical. */
export function VoiceSearchButton({
  voice,
  className,
}: {
  voice: UseVoiceSearchResult
  className?: string
}) {
  const { state } = voice
  const canCancel = state === "requesting" || state === "listening"

  const label =
    state === "unsupported"
      ? "Voice search isn't supported in this browser"
      : state === "requesting"
        ? "Requesting microphone permission…"
        : state === "listening"
          ? "Listening — tap to stop"
          : state === "processing"
            ? "Processing voice input"
            : state === "permission-denied"
              ? "Microphone permission denied — tap to try again"
              : state === "error"
                ? "Voice search error — tap to try again"
                : "Search by voice"

  const Icon =
    state === "processing" ? Loader2 : state === "permission-denied" || state === "error" || state === "unsupported" ? MicOff : Mic

  return (
    <button
      type="button"
      onClick={() => (canCancel ? voice.stop() : voice.start())}
      disabled={state === "processing"}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-6 items-center justify-center rounded-full transition-colors",
        state === "listening"
          ? "bg-[var(--kn-ai)]/15 text-[var(--kn-ai)]"
          : state === "permission-denied" || state === "error"
            ? "text-destructive"
            : state === "unsupported"
              ? "text-muted-foreground/50"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Icon className={cn("size-3.5", state === "processing" && "animate-spin", state === "listening" && "animate-pulse")} />
    </button>
  )
}

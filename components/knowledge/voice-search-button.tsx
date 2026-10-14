"use client"

import { Loader2, Mic, MicOff } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UseVoiceSearchResult } from "@/lib/knowledge/use-voice-search"
import { useT } from "./i18n"

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
  const t = useT()
  const { state } = voice
  const canCancel = state === "requesting" || state === "listening"

  const label =
    state === "unsupported"
      ? t.voiceSearch.unsupported
      : state === "requesting"
        ? t.voiceSearch.requesting
        : state === "listening"
          ? t.voiceSearch.listening
          : state === "processing"
            ? t.voiceSearch.processing
            : state === "permission-denied"
              ? t.voiceSearch.denied
              : state === "error"
                ? t.voiceSearch.error
                : t.voiceSearch.idle

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

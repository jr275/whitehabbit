"use client"

import { Check, Link2, Loader2, Sparkles, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface SaveDialogProps {
  open: boolean
  onClose: () => void
}

type Stage = "input" | "saving" | "done"

export function SaveDialog({ open, onClose }: SaveDialogProps) {
  const [url, setUrl] = useState("")
  const [stage, setStage] = useState<Stage>("input")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUrl("")
      setStage("input")
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  function handleSave() {
    if (!url.trim()) return
    setStage("saving")
    // Front-end confirmation choreography only — no fabricated backend.
    setTimeout(() => setStage("done"), 900)
    setTimeout(() => onClose(), 2400)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[16vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Save to your library"
    >
      <button aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="kn-rise relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Link2 className="size-3.5" /> Save to library
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          {stage === "input" && (
            <>
              <label htmlFor="save-url" className="mb-2 block text-sm font-medium text-foreground">
                Paste anything worth remembering
              </label>
              <input
                id="save-url"
                ref={inputRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSave()
                }}
                placeholder="https://…"
                className="modal-input"
              />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3 text-[var(--kn-ai)]" />
                We&apos;ll fetch it, summarize it and file it under the right topics.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!url.trim()}
                  className="h-9 rounded-lg bg-[var(--kn-ai)] px-4 text-sm font-medium text-[color:oklch(0.2_0.02_75)] transition-opacity disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </>
          )}

          {stage === "saving" && (
            <div className="flex items-center gap-3 py-6">
              <Loader2 className="size-5 animate-spin text-[var(--kn-ai)]" />
              <p className="text-sm text-foreground">Saving to your library…</p>
            </div>
          )}

          {stage === "done" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-grow/15 text-grow">
                <Check className="size-5" strokeWidth={3} />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Saved</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Fetching content and understanding it now — it&apos;ll be ready in your library shortly.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

"use client"

import { AlertCircle, ArrowRight, Check, Link2, Loader2, Sparkles, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { saveUrl } from "@/lib/knowledge/client"
import type { KnowledgeItem } from "@/lib/knowledge/types"
import { useT } from "./i18n"

interface SaveDialogProps {
  open: boolean
  onClose: () => void
}

type Stage = "input" | "saving" | "done" | "duplicate" | "error"

export function SaveDialog({ open, onClose }: SaveDialogProps) {
  const t = useT()
  const [url, setUrl] = useState("")
  const [stage, setStage] = useState<Stage>("input")
  const [message, setMessage] = useState<string | null>(null)
  const [existing, setExisting] = useState<KnowledgeItem | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUrl("")
      setStage("input")
      setMessage(null)
      setExisting(null)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  async function handleSave() {
    const trimmed = url.trim()
    if (!trimmed) return
    setStage("saving")
    setMessage(null)
    try {
      // Real POST /api/knowledge — persists the item and schedules
      // background fetch + extraction on the server.
      const { item, duplicate } = await saveUrl(trimmed)
      if (duplicate) {
        // Already saved — offer to open it instead of adding a copy.
        setExisting(item)
        setStage("duplicate")
        return
      }
      // Broadcast so the Library (a separate React tree) inserts the
      // new card and starts polling its live processing state.
      window.dispatchEvent(new CustomEvent("knowledge:saved", { detail: item }))
      setStage("done")
      setTimeout(() => onClose(), 1600)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t.saveDialog.genericError)
      setStage("error")
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[16vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t.saveDialog.dialogLabel}
    >
      <button aria-label={t.common.close} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="kn-rise relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Link2 className="size-4 text-primary" /> {t.saveDialog.heading}
          </span>
          <button
            onClick={onClose}
            aria-label={t.common.close}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          {(stage === "input" || stage === "error") && (
            <>
              <label htmlFor="save-url" className="mb-2 block text-sm font-medium text-foreground">
                {t.saveDialog.field}
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
                aria-invalid={stage === "error"}
              />
              {stage === "error" && message ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="size-3" />
                  {message}
                </p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="size-3 text-[var(--kn-ai)]" />
                  {t.saveDialog.hint}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!url.trim()}
                  className="h-9 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  {stage === "error" ? t.common.tryAgain : t.common.save}
                </button>
              </div>
            </>
          )}

          {stage === "saving" && (
            <div className="flex items-center gap-3 py-6">
              <Loader2 className="size-5 animate-spin text-[var(--kn-ai)]" />
              <p className="text-sm text-foreground">{t.saveDialog.saving}</p>
            </div>
          )}

          {stage === "done" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-grow/15 text-grow">
                <Check className="size-5" strokeWidth={3} />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{t.saveDialog.saved}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.saveDialog.savedHint}
                </p>
              </div>
            </div>
          )}

          {stage === "duplicate" && existing && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Check className="size-4.5" strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.saveDialog.duplicate}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{existing.title || existing.url}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={onClose}
                  className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  {t.common.close}
                </button>
                <Link
                  href={`/knowledge/read/${existing.id}`}
                  onClick={onClose}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {t.saveDialog.open} <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

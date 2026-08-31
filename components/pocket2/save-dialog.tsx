"use client"

/* ================================================================== *
 * SAVE — the interaction the whole product hangs on.
 *
 * Design rules, in order of importance:
 *
 *  1. ONE field. Paste, Enter, done. No form, no category picker, no
 *     "add tags before saving" — anything that turns saving into a
 *     chore means links stop getting saved.
 *  2. The response is IMMEDIATE. Saving does no network fetch of the
 *     page, so the card appears at once, honestly marked as still
 *     fetching, and fills in underneath.
 *  3. A duplicate is INFORMATION, not an error. "Already in your
 *     library" with a way to open it beats a red message.
 * ================================================================== */

import { AlertCircle, Check, Clipboard, Link2, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import type { SavedItemView } from "@/lib/pocket2/domain/types"
import { SavedPreview } from "./saved-preview"

type Phase =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; item: SavedItemView; duplicate: boolean }
  | { kind: "error"; message: string }

/** How long to keep watching a freshly-saved item fill in. Ingestion
 * is normally sub-second; this is the ceiling before the dialog stops
 * asking and simply says the details are still coming. */
const WATCH_TIMEOUT_MS = 20_000
const WATCH_INTERVAL_MS = 1_200

export function SaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(() => {
    setUrl("")
    setPhase({ kind: "idle" })
  }, [])

  const close = useCallback(() => {
    onClose()
    // Refresh so the library behind the dialog reflects what was just
    // saved, rather than needing a manual reload.
    router.refresh()
    // Delay the reset so the dialog does not visibly empty itself
    // during its own close transition.
    setTimeout(reset, 200)
  }, [onClose, reset, router])

  // Focus the field on open. Everything about this dialog assumes the
  // person arrived with a URL already on their clipboard.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close()
      // A minimal focus trap: Tab must not walk out of the dialog into
      // the page behind it.
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, a[href], [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, close])

  /* Watch a freshly-saved item until ingestion resolves it. Polling
   * rather than a socket: this runs for a few seconds after one
   * deliberate action, and a persistent connection for that would cost
   * far more than it saves. */
  useEffect(() => {
    if (phase.kind !== "saved" || phase.item.ingestStatus !== "pending") return
    const itemId = phase.item.id
    const deadline = Date.now() + WATCH_TIMEOUT_MS
    let cancelled = false

    // setInterval discards the promise an async callback returns, so
    // a rejection inside it would be invisible. The work is wrapped in
    // a named async function and explicitly voided instead.
    async function poll() {
      if (cancelled || Date.now() > deadline) { clearInterval(timer); return }
      try {
        const response = await fetch(`/api/pocket2/items/${itemId}`)
        if (!response.ok) { clearInterval(timer); return }
        const body = (await response.json()) as { item: SavedItemView }
        if (cancelled) return
        if (body.item.ingestStatus !== "pending") {
          clearInterval(timer)
          setPhase((current) =>
            current.kind === "saved" && current.item.id === itemId
              ? { ...current, item: body.item }
              : current)
        }
      } catch {
        clearInterval(timer)
      }
    }

    const timer = setInterval(() => void poll(), WATCH_INTERVAL_MS)

    return () => { cancelled = true; clearInterval(timer) }
  }, [phase])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setPhase({ kind: "saving" })
    try {
      const response = await fetch("/api/pocket2/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
      const body = (await response.json().catch(() => null)) as
        | { item: SavedItemView; duplicate: boolean }
        | { error: string }
        | null

      if (!response.ok || !body || !("item" in body)) {
        // Shows the server's real message ("Only http and https links
        // can be saved") rather than a generic failure.
        setPhase({ kind: "error", message: (body && "error" in body ? body.error : null) ?? "That link couldn't be saved." })
        return
      }
      setPhase({ kind: "saved", item: body.item, duplicate: body.duplicate })
      setUrl("")
    } catch {
      setPhase({ kind: "error", message: "You appear to be offline. The link wasn't saved." })
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) { setUrl(text.trim()); inputRef.current?.focus() }
    } catch {
      // Clipboard permission denied or unavailable — the field still
      // works, so there is nothing to report.
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "color-mix(in oklch, var(--p2-ink-strong) 32%, transparent)" }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Save a link"
        className="p2-enter relative w-full max-w-lg overflow-hidden"
        style={{
          background: "var(--p2-surface)",
          border: "1px solid var(--p2-line-strong)",
          borderRadius: "var(--p2-r-xl)",
          boxShadow: "var(--p2-shadow-lg)",
        }}
      >
        <form onSubmit={(event) => void submit(event)} className="p-4 pt-12">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2
                size={16} aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--p2-faint)" }}
              />
              <input
                ref={inputRef}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value)
                  if (phase.kind === "error") setPhase({ kind: "idle" })
                }}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a link…"
                aria-label="Link to save"
                aria-invalid={phase.kind === "error"}
                className="p2-field p2-field-lg"
                style={{ paddingLeft: "2.25rem" }}
                disabled={phase.kind === "saving"}
              />
            </div>
            <button
              type="button" onClick={() => void pasteFromClipboard()}
              className="p2-btn p2-btn-secondary p2-btn-icon" style={{ height: "3rem", width: "3rem" }}
              aria-label="Paste from clipboard" title="Paste from clipboard"
            >
              <Clipboard aria-hidden="true" />
            </button>
            <button type="submit" disabled={phase.kind === "saving" || !url.trim()} className="p2-btn p2-btn-primary p2-btn-lg">
              {phase.kind === "saving" ? <><Loader2 className="animate-spin" aria-hidden="true" /> Saving</> : "Save"}
            </button>
          </div>

          {phase.kind === "error" && (
            <p role="alert" className="p2-small mt-3 flex items-start gap-2" style={{ color: "var(--p2-danger)" }}>
              <AlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
              {phase.message}
            </p>
          )}

          {phase.kind === "idle" && (
            <p className="p2-meta mt-3">
              Pocket2 fetches the title, description and image, and works out what it is.
            </p>
          )}
        </form>

        {phase.kind === "saved" && (
          <div style={{ borderTop: "1px solid var(--p2-line)", background: "var(--p2-surface-sunk)" }} className="p-4">
            <p className="p2-small mb-3 flex items-center gap-1.5" style={{ color: phase.duplicate ? "var(--p2-muted)" : "var(--p2-good)", fontWeight: 520 }}>
              {phase.duplicate
                ? <>Already in your library</>
                : <><Check size={15} aria-hidden="true" /> Saved</>}
            </p>
            <SavedPreview item={phase.item} />
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => { reset(); inputRef.current?.focus() }} className="p2-btn p2-btn-secondary p2-btn-sm">
                Save another
              </button>
              <button type="button" onClick={close} className="p2-btn p2-btn-ghost p2-btn-sm">Done</button>
            </div>
          </div>
        )}

        <button
          type="button" onClick={close} aria-label="Close"
          className="p2-btn p2-btn-ghost p2-btn-icon absolute right-2.5 top-2.5"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

"use client"

/* Save a URL. Optimistic: the card appears in the list before the
 * server confirms, because the whole point of the async pipeline is
 * that saving feels instant. */

import { useState } from "react"
import type { KnowledgeItemDto } from "@/lib/knowledge/api/contracts"

interface SaveFormProps {
  onSaved: (item: KnowledgeItemDto, duplicate: boolean) => void
}

export function SaveForm({ onSaved }: SaveFormProps) {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = url.trim()
    if (trimmed.length === 0) return

    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const res = await fetch("/api/knowledge/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()

      if (!res.ok) {
        // The API's messages are already written for a person.
        setError(typeof data?.error === "string" ? data.error : "We couldn't save that link.")
        return
      }

      setUrl("")
      if (data.duplicate) setNotice("You'd already saved that one.")
      onSaved(data.item as KnowledgeItemDto, Boolean(data.duplicate))
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link to save it"
          aria-label="URL to save"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || url.trim().length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </form>
  )
}

"use client"

import { Plus } from "lucide-react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { SaveDialog } from "./save-dialog"

/* Owns the "can I save right now?" state for the whole shell.
 *
 * Three ways in, because saving must never be more than one gesture
 * away: the button, the `s` key, and a ?save=1 URL — which is what
 * makes a bookmarklet, a share target or a browser extension work
 * later with no new code here. */
export function SaveLauncher() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // ?save=1 opens the dialog, then the parameter is removed so a
  // refresh or a shared link does not reopen it forever.
  useEffect(() => {
    if (params.get("save") !== null) {
      setOpen(true)
      const next = new URLSearchParams(params)
      next.delete("save")
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }
  }, [params, pathname, router])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "s" || event.metaKey || event.ctrlKey || event.altKey) return
      // Never steal a keystroke someone is typing into a field.
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      event.preventDefault()
      setOpen(true)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p2-btn p2-btn-primary p2-btn-sm"
        title="Save a link (s)"
      >
        <Plus size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Save</span>
      </button>
      <SaveDialog open={open} onClose={close} />
    </>
  )
}

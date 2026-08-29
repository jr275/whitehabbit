"use client"

import { LogOut, Settings, User } from "lucide-react"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { POCKET2_BASE, POCKET2_ROUTES } from "@/lib/pocket2/routes"

/* Account menu. Small enough to hand-roll rather than pull in a menu
 * primitive, but it still honours the two things people expect from a
 * menu: Escape closes it, and a click outside closes it. */
export function AccountMenu({ email, workspaceName }: { email: string; workspaceName: string }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    function onClick(e: MouseEvent) {
      if (!container.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClick)
    }
  }, [open])

  const initial = (email.trim()[0] ?? "?").toUpperCase()

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="p2-focusable flex h-8 w-8 items-center justify-center rounded-full transition-colors"
        style={{ background: "var(--p2-accent-soft)", color: "var(--p2-accent)", fontSize: "0.75rem", fontWeight: 600 }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="p2-enter absolute right-0 z-40 mt-2 w-60 overflow-hidden p-1"
          style={{
            background: "var(--p2-surface)",
            border: "1px solid var(--p2-line-strong)",
            borderRadius: "var(--p2-r-lg)",
            boxShadow: "var(--p2-shadow-lg)",
          }}
        >
          <div className="px-2.5 py-2">
            <p className="truncate" style={{ fontSize: "0.8125rem", fontWeight: 540, color: "var(--p2-ink-strong)" }}>{email}</p>
            <p className="p2-meta truncate">{workspaceName}</p>
          </div>
          <div style={{ borderTop: "1px solid var(--p2-line)" }} className="my-1" />
          <Link role="menuitem" href={POCKET2_ROUTES.settings} onClick={() => setOpen(false)}
                className="p2-focusable flex items-center gap-2.5 rounded-[var(--p2-r-md)] px-2.5 py-1.5"
                style={{ fontSize: "0.8125rem", color: "var(--p2-muted)" }}>
            <Settings size={14} aria-hidden="true" /> Settings
          </Link>
          <Link role="menuitem" href={`${POCKET2_ROUTES.settings}#profile`} onClick={() => setOpen(false)}
                className="p2-focusable flex items-center gap-2.5 rounded-[var(--p2-r-md)] px-2.5 py-1.5"
                style={{ fontSize: "0.8125rem", color: "var(--p2-muted)" }}>
            <User size={14} aria-hidden="true" /> Profile
          </Link>
          <div style={{ borderTop: "1px solid var(--p2-line)" }} className="my-1" />
          <button
            role="menuitem" type="button"
            onClick={() => signOut({ callbackUrl: POCKET2_BASE })}
            className="p2-focusable flex w-full items-center gap-2.5 rounded-[var(--p2-r-md)] px-2.5 py-1.5 text-left"
            style={{ fontSize: "0.8125rem", color: "var(--p2-muted)" }}
          >
            <LogOut size={14} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

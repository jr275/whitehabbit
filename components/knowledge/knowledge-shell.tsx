"use client"

import { useEffect, useState } from "react"
import { CommandPalette } from "./command-palette"
import { KnowledgeSidebar } from "./knowledge-sidebar"
import { KnowledgeTopbar } from "./knowledge-topbar"
import { MobileNav } from "./mobile-nav"
import { SaveDialog } from "./save-dialog"

import { KnowledgeAuthProvider, useKnowledgeAuth } from "./knowledge-auth"

export function KnowledgeShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault()
        setSaveOpen(true)
      } else if (e.key === "Escape") {
        setPaletteOpen(false)
        setSaveOpen(false)
      }
    }
    function openSave() {
      setSaveOpen(true)
    }
    function openPalette() {
      setPaletteOpen(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("knowledge:save", openSave)
    window.addEventListener("knowledge:command", openPalette)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("knowledge:save", openSave)
      window.removeEventListener("knowledge:command", openPalette)
    }
  }, [])

  return (
    <KnowledgeAuthProvider>
      <KnowledgeShellInner
        paletteOpen={paletteOpen}
        setPaletteOpen={setPaletteOpen}
        saveOpen={saveOpen}
        setSaveOpen={setSaveOpen}
      >
        {children}
      </KnowledgeShellInner>
    </KnowledgeAuthProvider>
  )
}

/** Split out only so the shell itself can call useKnowledgeAuth() —
 *  a component cannot consume a context it renders. */
function KnowledgeShellInner({
  children,
  paletteOpen,
  setPaletteOpen,
  saveOpen,
  setSaveOpen,
}: {
  children: React.ReactNode
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
  saveOpen: boolean
  setSaveOpen: (v: boolean) => void
}) {
  return (
    <div className="knowledge-surface min-h-dvh bg-background text-foreground">
      <a
        href="#kn-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="flex">
        <KnowledgeSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <KnowledgeTopbar
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenSave={() => setSaveOpen(true)}
          />
          <SessionExpiredBanner />
          <main id="kn-main" className="flex-1 pb-24 lg:pb-0">
            {children}
          </main>
        </div>
      </div>

      <MobileNav onOpenSave={() => setSaveOpen(true)} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSave={() => setSaveOpen(true)}
      />
      <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} />
    </div>
  )
}

/** Shown only in the third state. A guest never sees it — for them the
 *  local library is the product, not a warning. Someone whose session
 *  ended sees it on every Knowledge page until they act, because the
 *  failure it describes is silent otherwise: writes keep succeeding
 *  into localStorage under a library they believe is their account. */
function SessionExpiredBanner() {
  const auth = useKnowledgeAuth()
  if (auth.state !== "auth_required") return null
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 sm:mx-6"
    >
      <p className="flex-1 text-sm text-foreground">
        <span className="font-medium">Your session ended.</span>{" "}
        <span className="text-muted-foreground">
          Anything you save now stays on this device until you sign in again.
        </span>
      </p>
      <button
        onClick={auth.promptSignIn}
        className="h-8 shrink-0 rounded-full bg-destructive px-3.5 text-[13px] font-medium text-destructive-foreground transition-opacity hover:opacity-90"
      >
        Sign in again
      </button>
    </div>
  )
}

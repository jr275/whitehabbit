"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CommandPalette } from "./command-palette"
import { KnowledgeSidebar } from "./knowledge-sidebar"
import { KnowledgeTopbar } from "./knowledge-topbar"
import { MobileNav } from "./mobile-nav"
import { SaveDialog } from "./save-dialog"

const UNCHROMED_ROUTE = "/knowledge"

export function KnowledgeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
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

  // The Understand surface brings its own header, navigation, main
  // landmark and (light) theme — it is a full-page editorial reading
  // experience rather than a pane inside the app chrome. Rendering it
  // inside this shell would nest a second <main>, stack two headers,
  // and frame a light page in the dark sidebar.
  //
  // A child route cannot remove a parent layout in the App Router, so
  // this single explicit exception is the escape hatch. It matches one
  // path and leaves every other Knowledge route untouched.
  if (pathname === UNCHROMED_ROUTE) return <>{children}</>

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

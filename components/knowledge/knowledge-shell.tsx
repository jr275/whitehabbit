"use client"

import { useEffect, useState } from "react"
import { type KnowledgeTheme, persistKnowledgeTheme } from "@/lib/knowledge/theme"
import { CommandPalette } from "./command-palette"
import { KnowledgeSidebar } from "./knowledge-sidebar"
import { KnowledgeTopbar } from "./knowledge-topbar"
import { MobileNav } from "./mobile-nav"
import { SaveDialog } from "./save-dialog"

export function KnowledgeShell({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  /* Read from a cookie on the server so the first paint is already the
   * reader's choice — a theme resolved on the client flashes the other
   * one first, which is worse than not offering the choice. */
  initialTheme: KnowledgeTheme
}) {
  const [theme, setTheme] = useState<KnowledgeTheme>(initialTheme)

  function toggleTheme() {
    const next: KnowledgeTheme = theme === "black" ? "clean" : "black"
    setTheme(next)
    persistKnowledgeTheme(next)
  }

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
    <div data-kn-theme={theme} className="knowledge-surface min-h-dvh bg-background text-foreground">
      <a
        href="#kn-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="flex">
        <KnowledgeSidebar theme={theme} onToggleTheme={toggleTheme} />

        <div className="flex min-w-0 flex-1 flex-col">
          <KnowledgeTopbar
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenSave={() => setSaveOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <main id="kn-main" className="flex-1 pb-24 lg:pb-0">
            {children}
          </main>
        </div>
      </div>

      <MobileNav />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSave={() => setSaveOpen(true)}
      />
      <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} />
    </div>
  )
}

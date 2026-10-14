"use client"

import { useEffect, useState } from "react"
import { type KnowledgeTheme, persistKnowledgeTheme } from "@/lib/knowledge/theme"
import { htmlLang, type Locale } from "@/lib/knowledge/i18n/locale"
import { LocaleProvider, useLocale, useT } from "./i18n"
import { CommandPalette } from "./command-palette"
import { GuestImport } from "./guest-import"
import { KnowledgeSidebar } from "./knowledge-sidebar"
import { KnowledgeTopbar } from "./knowledge-topbar"
import { MobileNav } from "./mobile-nav"
import { SaveDialog } from "./save-dialog"

export function KnowledgeShell({
  children,
  initialTheme,
  initialLocale,
}: {
  children: React.ReactNode
  /* Read from a cookie on the server so the first paint is already the
   * reader's choice — a theme resolved on the client flashes the other
   * one first, which is worse than not offering the choice. */
  initialTheme: KnowledgeTheme
  /* Same reasoning, and the same mechanism: see app/knowledge/layout.tsx
   * and lib/knowledge/i18n/locale.ts. */
  initialLocale: Locale
}) {
  return (
    <LocaleProvider locale={initialLocale}>
      <KnowledgeChrome initialTheme={initialTheme}>
        {children}
      </KnowledgeChrome>
    </LocaleProvider>
  )
}

/* Split out so it sits INSIDE the provider — useT() throws above it,
 * which is the point: a chrome element rendered outside would be the
 * one English thing on a Portuguese screen. */
function KnowledgeChrome({ children, initialTheme }: { children: React.ReactNode; initialTheme: KnowledgeTheme }) {
  const t = useT()
  /* The LIVE locale, not the one the server sent: switching language
   * has to move `lang` with it, or a screen reader keeps the old voice
   * for the rest of the session. */
  const { locale } = useLocale()
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
    <div
      data-kn-theme={theme}
      /* lang on the surface, not on <html>: this layout is nested and
       * does not own the document element. `lang` is valid on any
       * element and is what a screen reader switches voice on. */
      lang={htmlLang(locale)}
      className="knowledge-surface min-h-dvh bg-background text-foreground"
    >
      <a
        href="#kn-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t.common.skipToContent}
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
          {/* Above the page, not inside it: the offer to move a
              browser-local library into the account applies to every
              Knowledge screen, and belongs to none of them. */}
          <GuestImport />
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

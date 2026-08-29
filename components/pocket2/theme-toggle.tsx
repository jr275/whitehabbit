"use client"

/* ================================================================== *
 * THEME TOGGLE — cycles system -> light -> dark.
 *
 * "System" is a real, distinct state, not a synonym for light: it
 * stamps no data-theme attribute at all, which is what lets the
 * prefers-color-scheme block in pocket2.css take over. Writing
 * data-theme="light" on a dark OS is a different (and equally valid)
 * user intent, and the two must not be conflated.
 * ================================================================== */

import { Monitor, Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, type ThemePreference } from "./theme"

const NEXT: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" }
const ICON = { system: Monitor, light: Sun, dark: Moon }
const LABEL: Record<ThemePreference, string> = {
  system: "Theme: match system",
  light: "Theme: light",
  dark: "Theme: dark",
}

export function ThemeToggle() {
  // Starts as null so the server-rendered markup and the first client
  // render agree; the real preference lives in localStorage, which the
  // server cannot see. Rendering the wrong icon then correcting it
  // would be a visible flicker on every page load.
  const [theme, setTheme] = useState<ThemePreference | null>(null)

  useEffect(() => { setTheme(readStoredTheme()) }, [])

  function cycle() {
    const next = NEXT[theme ?? "system"]
    setTheme(next)
    applyTheme(next)
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private browsing or blocked site data: the toggle still works
      // for this page view, it just will not be remembered.
    }
  }

  const Icon = ICON[theme ?? "system"]
  return (
    <button
      type="button" onClick={cycle}
      className="p2-btn p2-btn-ghost p2-btn-icon"
      aria-label={LABEL[theme ?? "system"]}
      title={LABEL[theme ?? "system"]}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}

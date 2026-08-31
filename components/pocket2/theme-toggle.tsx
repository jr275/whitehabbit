"use client"

/* ================================================================== *
 * THEME TOGGLE — cycles system -> light -> dark.
 *
 * "System" is a real, distinct state, not a synonym for light: it
 * stamps no data-theme attribute at all, which is what lets the
 * prefers-color-scheme block in pocket2.css take over. Writing
 * data-theme="light" on a dark OS is a different (and equally valid)
 * user intent, and the two must not be conflated.
 *
 * The preference lives in localStorage, which the server cannot see,
 * so it is read through useSyncExternalStore rather than by setting
 * state inside an effect. That gives React an explicit server
 * snapshot ("system") to render during hydration, instead of
 * rendering one value and immediately re-rendering with another.
 * ================================================================== */

import { Monitor, Moon, Sun } from "lucide-react"
import { useCallback, useSyncExternalStore } from "react"
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, type ThemePreference } from "./theme"

const NEXT: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" }
const ICON = { system: Monitor, light: Sun, dark: Moon }
const LABEL: Record<ThemePreference, string> = {
  system: "Theme: match system",
  light: "Theme: light",
  dark: "Theme: dark",
}

/** Our own change events, plus `storage` so a change made in another
 * tab is reflected here too. */
const THEME_CHANGE_EVENT = "pocket2:theme-change"

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

/** Returns one of three interned strings, so React's Object.is check
 * sees a stable value between renders. */
const getSnapshot = (): ThemePreference => readStoredTheme()

/** The server has no localStorage, and neither does the first client
 * render — both must agree, or hydration mismatches. */
const getServerSnapshot = (): ThemePreference => "system"

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const cycle = useCallback(() => {
    const next = NEXT[theme]
    applyTheme(next)
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private browsing or blocked site data: the toggle still works
      // for this page view, it just will not be remembered.
    }
    // `storage` does not fire in the tab that made the change.
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }, [theme])

  const Icon = ICON[theme]
  return (
    <button
      type="button" onClick={cycle}
      className="p2-btn p2-btn-ghost p2-btn-icon"
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}

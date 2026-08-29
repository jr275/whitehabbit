/* Shared theme vocabulary. Kept out of the toggle component so the
 * no-flash inline script in the layout and the toggle agree on the
 * storage key and the attribute — a mismatch there is exactly the
 * kind of bug that only shows up as a flash on someone else's
 * machine. */

export type ThemePreference = "system" | "light" | "dark"

export const THEME_STORAGE_KEY = "pocket2:theme"
export const THEME_ROOT_ATTR = "data-theme"

export function readStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw === "light" || raw === "dark" ? raw : "system"
  } catch {
    return "system"
  }
}

/** Stamps (or clears) the attribute on the Pocket2 root. "system"
 * clears it, so the prefers-color-scheme rule applies. */
export function applyTheme(theme: ThemePreference): void {
  const root = document.querySelector("[data-pocket2]")
  if (!root) return
  if (theme === "system") root.removeAttribute(THEME_ROOT_ATTR)
  else root.setAttribute(THEME_ROOT_ATTR, theme)
}

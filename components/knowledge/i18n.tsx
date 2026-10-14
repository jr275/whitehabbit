"use client"

/* ================================================================== *
 * THE LANGUAGE, IN THE TREE.
 *
 * One context, resolved on the SERVER and handed down, for the same
 * reason the theme is (components/knowledge/knowledge-shell.tsx): a
 * language decided on the client renders English first and then
 * repaints in Portuguese, which is worse than not offering the choice.
 * The layout reads the cookie and the Accept-Language header, so the
 * first paint is already the right language.
 *
 * `useT()` returns the whole dictionary rather than a `t("some.key")`
 * lookup function. That is deliberate: `t.ask.title` is checked by the
 * compiler and renamed by a refactor, while `t("ask.title")` is a
 * string that is only wrong at runtime, on the screen, in front of
 * someone. The dictionary's own types already guarantee both languages
 * carry the key — see lib/knowledge/i18n/dictionary.ts.
 * ================================================================== */

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { dictionaryFor, type Dictionary } from "@/lib/knowledge/i18n/dictionary"
import { LOCALE_NAMES, persistLocale, type Locale } from "@/lib/knowledge/i18n/locale"

interface LocaleValue {
  locale: Locale
  t: Dictionary
  setLocale: (next: Locale) => void
  /** Numbers in the reader's own notation: 1,234 or 1.234. */
  n: (value: number) => string
}

const LocaleContext = createContext<LocaleValue | null>(null)

export function LocaleProvider({ locale: initial, children }: { locale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    persistLocale(next)
  }, [])

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      t: dictionaryFor(locale),
      setLocale,
      n: (v: number) => v.toLocaleString(locale),
    }),
    [locale, setLocale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/**
 * THROWS rather than falling back to English.
 *
 * A component rendered outside the provider would silently be the only
 * English thing on a Portuguese screen, and nobody would notice until a
 * reader did. Failing at the first render says exactly which subtree is
 * not wrapped.
 */
export function useLocaleContext(): LocaleValue {
  const value = useContext(LocaleContext)
  if (!value) {
    throw new Error("useLocaleContext must be used inside <LocaleProvider> (components/knowledge/knowledge-shell.tsx).")
  }
  return value
}

/** The dictionary for the current language. */
export function useT(): Dictionary {
  return useLocaleContext().t
}

/** The current language, a setter, and a locale-aware number formatter. */
export function useLocale(): Omit<LocaleValue, "t"> {
  const { locale, setLocale, n } = useLocaleContext()
  return { locale, setLocale, n }
}

export { LOCALE_NAMES }

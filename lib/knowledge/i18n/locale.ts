/* ================================================================== *
 * LOCALE — which language Keeply speaks.
 *
 * Two languages, both first-class: Brazilian Portuguese and English.
 * Neither is a translation of the other in the product's mind — the
 * dictionary's English is the source of truth for the KEY SET only,
 * which is what lets TypeScript refuse a build with a missing string.
 *
 * WHY A COOKIE AND NOT A URL SEGMENT. Keeply's routes are already
 * written down in a dozen places — the rail, the mobile bar, the
 * command palette, every citation's link into the reader, every
 * `askAboutHref`. A `/[locale]/...` segment would rewrite all of them
 * and break every link anyone has already saved or shared. The theme
 * made the same choice for the same reason (lib/knowledge/theme.ts),
 * and reusing that mechanism means one way to carry a reader's
 * preference, not two.
 *
 * FIRST VISIT. With no cookie, the browser's own Accept-Language
 * decides, because the reader has already told their browser what they
 * read. Only when it says nothing useful does English apply — a
 * default, never a guess dressed as a detection.
 * ================================================================== */

export type Locale = "pt-BR" | "en"

export const LOCALES: readonly Locale[] = ["pt-BR", "en"] as const

/** Shown in the switcher, in the language itself. A language named in
 *  a language you do not read is not a choice you can make. */
export const LOCALE_NAMES: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
}

export const KN_LOCALE_COOKIE = "kn-locale"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/** The stored choice, or null when there is none to read. Null is a
 *  real answer here — it is what sends the decision to the browser's
 *  own header instead. */
export function parseLocale(value: string | undefined): Locale | null {
  return isLocale(value) ? value : null
}

/**
 * The best match for an Accept-Language header.
 *
 * Deliberately small: full RFC 4647 matching is not needed to choose
 * between two languages. Entries are read in q-order and the first one
 * whose PRIMARY subtag is one we speak wins, so `pt-PT`, `pt` and
 * `pt-BR` all land on Portuguese — a reader who asked for Portuguese
 * gets Portuguese rather than English on a region mismatch.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return "en"

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2)
      const quality = q === undefined ? 1 : Number(q)
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 }
    })
    .filter((entry) => entry.tag !== "" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0]
    if (primary === "pt") return "pt-BR"
    if (primary === "en") return "en"
  }
  return "en"
}

/** Resolve the locale for a request: the reader's stored choice first,
 *  their browser's preference second. */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null | undefined): Locale {
  return parseLocale(cookieValue) ?? negotiateLocale(acceptLanguage)
}

/** The value for the `lang` attribute. Identical to the locale today;
 *  it exists so a future locale whose BCP 47 tag differs from our key
 *  has one place to say so. */
export function htmlLang(locale: Locale): string {
  return locale
}

export function persistLocale(locale: Locale): void {
  if (typeof document === "undefined") return
  document.cookie = `${KN_LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}

import "server-only"

/* ================================================================== *
 * THE LANGUAGE, ON THE SERVER.
 *
 * Server Components cannot use the context in
 * components/knowledge/i18n.tsx — there is no client tree to read
 * from — so they read the request directly, through the one resolver
 * every path shares (resolveLocale: stored choice first, the browser's
 * Accept-Language second).
 *
 * The layout uses this too, so there is exactly ONE place that decides
 * what language a request is in. Two readers of the same cookie is how
 * a page ends up one language and its chrome another.
 * ================================================================== */

import { cookies, headers } from "next/headers"
import { dictionaryFor, type Dictionary } from "./dictionary"
import { KN_LOCALE_COOKIE, resolveLocale, type Locale } from "./locale"

export async function getLocale(): Promise<Locale> {
  const [jar, head] = await Promise.all([cookies(), headers()])
  return resolveLocale(jar.get(KN_LOCALE_COOKIE)?.value, head.get("accept-language"))
}

/** The dictionary and the locale together — a server page almost always
 *  needs both, and asking twice would read the request twice. */
export async function getTranslations(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale()
  return { locale, t: dictionaryFor(locale) }
}

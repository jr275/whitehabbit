/* ================================================================== *
 * FORMATTING — the strings whose shape depends on a value.
 *
 * These live apart from `lib/knowledge/config.ts`, where they started,
 * for one concrete reason: that module also owns the navigation and the
 * per-kind icons, so it imports `lucide-react`. Anything importing it
 * pulls React in, which means this logic could not be loaded by a
 * `node --test` process at all — the date arithmetic and the two
 * languages' word order, the part most likely to be quietly wrong, was
 * the part no test could reach.
 *
 * Nothing here touches React, the DOM, or the network. Every function
 * takes the dictionary and the locale as arguments rather than reading
 * a context, so a Server Component, a Client Component and a test all
 * call the same code.
 * ================================================================== */

import type { Dictionary } from "./dictionary"
import type { Locale } from "./locale"
import type { KnowledgeKind } from "../types"

export function kindLabel(t: Dictionary, kind: KnowledgeKind): string {
  return t.kinds[kind]
}

/* One formatter per locale, built once. Intl does the hard part —
 * "2 days ago" and "há 2 dias" are both its own output, not a sentence
 * we assemble, so neither language gets the other's word order. */
const RELATIVE = new Map<Locale, Intl.RelativeTimeFormat>()

function relative(locale: Locale): Intl.RelativeTimeFormat {
  let fmt = RELATIVE.get(locale)
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
    RELATIVE.set(locale, fmt)
  }
  return fmt
}

/** "Saved 2 days ago" / "Salvo há 2 dias", computed against the real
 *  current time. */
export function savedAgo(t: Dictionary, locale: Locale, iso: string, now = new Date()): string {
  const then = new Date(iso)
  const days = Math.round((then.getTime() - now.getTime()) / 86_400_000)
  if (days === 0) return t.time.savedToday
  if (days === -1) return t.time.savedYesterday
  if (days > -7) return t.time.savedAgo(relative(locale).format(days, "day"))
  const weeks = Math.round(days / 7)
  return t.time.savedAgo(relative(locale).format(weeks, "week"))
}

export function durationLabel(t: Dictionary, kind: KnowledgeKind, min?: number): string | null {
  if (!min) return null
  if (kind === "podcast" || kind === "video") return t.time.minutes(min)
  return t.time.minutesRead(min)
}

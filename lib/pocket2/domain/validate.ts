/* ================================================================== *
 * VALIDATION — small, explicit, dependency-free.
 *
 * Deliberately not a schema library. The surface being validated is
 * a handful of request bodies and query strings; a hand-written
 * validator keeps the dependency count down and produces error
 * messages written for a person rather than derived from a schema
 * path. If the surface grows to where that stops being true, this is
 * the single module to swap.
 *
 * Every function here either returns a correctly-typed value or
 * throws — no function returns a partially-valid object, and none
 * silently coerces bad input into a default that hides a client bug.
 * ================================================================== */

import {
  CONTENT_TYPES, DATE_RANGES, DEFAULT_PAGE_SIZE, ITEM_STATUSES, MAX_PAGE_SIZE, SORT_OPTIONS,
  type ContentType, type DateRange, type ItemStatus, type LibraryQuery, type SortOption,
} from "./types"

export class FieldError extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = "FieldError"
    this.field = field
  }
}

export function requireString(value: unknown, field: string, opts: { max?: number; min?: number } = {}): string {
  if (typeof value !== "string") throw new FieldError(field, `${field} must be text.`)
  const trimmed = value.trim()
  const { min = 1, max = 2000 } = opts
  if (trimmed.length < min) throw new FieldError(field, `${field} is required.`)
  if (trimmed.length > max) throw new FieldError(field, `${field} must be ${max} characters or fewer.`)
  return trimmed
}

export function optionalString(value: unknown, field: string, max = 2000): string | null {
  if (value === undefined || value === null || value === "") return null
  return requireString(value, field, { max })
}

function isMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

/** Filters out unknown values rather than throwing: a stale bookmarked
 * URL with a filter we've since renamed should still load the library,
 * just without that filter. Malformed input on a READ is a degraded
 * result; malformed input on a WRITE is an error. */
function pickAll<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  const picked = raw.filter((v): v is T => isMember(v, allowed))
  return picked.length ? [...new Set(picked)] : undefined
}

/* NFKD decomposes an accented letter into a base letter plus a
 * combining mark, which the strip below then removes. It does NOT
 * touch letters that are their own codepoint rather than a decorated
 * base — so without this map, a tag named "Søren" would slug to
 * "s-ren" and "Weiß" to "wei". These are the Latin letters that
 * actually occur in tag and collection names. */
const LETTER_FOLDING: Record<string, string> = {
  "\u00f8": "o", "\u00e6": "ae", "\u0153": "oe", "\u00f0": "d",
  "\u00fe": "th", "\u00df": "ss", "\u0142": "l", "\u0111": "d",
  "\u0131": "i", "\u014b": "n",
}

/** Tag and collection slugs: lowercase, hyphenated, no path characters
 * — so a slug can never be used to traverse or inject. */
export function toSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, (char) => LETTER_FOLDING[char] ?? char)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

export function requireSlug(value: unknown, field: string): string {
  const slug = toSlug(requireString(value, field, { max: 80 }))
  if (!slug) throw new FieldError(field, `${field} must contain at least one letter or number.`)
  return slug
}

export function parseTagNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  const names = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 40)
  // cap the per-item tag count: an unbounded array here is a cheap way
  // to make one row expensive for everyone else in the tenant
  return [...new Set(names)].slice(0, 25)
}

/** Reads a repeatable query parameter that may arrive either as
 * ?tag=a&tag=b or as ?tag=a,b - both spellings are common in shared
 * links, and both must mean the same filter. */
function readList(params: URLSearchParams, key: string): string[] {
  const repeated = params.getAll(key)
  if (repeated.length > 1) return repeated
  return (repeated[0] ?? params.get(key) ?? "").split(",")
}

/** An empty filter array must become `undefined` ("no filter"), never
 * reach the repo as `[]` - which would read as "match nothing" and
 * silently return an empty library. */
function emptyToUndefined<T>(values: T[]): T[] | undefined {
  const capped = [...new Set(values)].slice(0, 20)
  return capped.length ? capped : undefined
}

/** Parses the library's combined filter state out of a URLSearchParams.
 * The URL is the source of truth for filter state, so a filtered view
 * is shareable, bookmarkable, and survives a refresh. */
export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
  const limitRaw = Number(params.get("limit"))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE

  const statusRaw = params.get("status")
  const status: ItemStatus | "favorite" | undefined =
    statusRaw === "favorite" ? "favorite" : isMember(statusRaw, ITEM_STATUSES) ? statusRaw : undefined

  const sortRaw = params.get("sort")
  const sort: SortOption = isMember(sortRaw, SORT_OPTIONS) ? sortRaw : "newest"

  const rangeRaw = params.get("range")
  const dateRange: DateRange = isMember(rangeRaw, DATE_RANGES) ? rangeRaw : "all"

  const numeric = (key: string): number | undefined => {
    const n = Number(params.get(key))
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  const search = params.get("q")?.trim()

  return {
    search: search && search.length > 0 ? search.slice(0, 200) : undefined,
    contentTypes: pickAll<ContentType>(readList(params, "type"), CONTENT_TYPES),
    status,
    domains: emptyToUndefined(
      readList(params, "domain").map((d) => d.trim().toLowerCase()).filter(Boolean),
    ),
    tagSlugs: emptyToUndefined(readList(params, "tag").map(toSlug).filter(Boolean)),
    collectionSlug: params.get("collection") ? toSlug(params.get("collection")!) : undefined,
    dateRange,
    dateFrom: numeric("from"),
    dateTo: numeric("to"),
    sort,
    limit,
    cursor: params.get("cursor") ?? undefined,
  }
}

/** Resolves a named date range into an absolute lower bound, so the
 * repo layer only ever deals in timestamps. `now` is injected so this
 * is testable without freezing the clock. */
export function resolveDateFloor(range: DateRange, now = Date.now()): number | undefined {
  const DAY = 86_400_000
  switch (range) {
    case "today": {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    case "week": return now - 7 * DAY
    case "month": return now - 30 * DAY
    default: return undefined
  }
}

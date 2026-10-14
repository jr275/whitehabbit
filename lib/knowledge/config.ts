import {
  FileText,
  Heart,
  Home,
  Library,
  Sparkles,
  Tag,
  Video,
  FileType2,
  MessageSquare,
  Mic,
  StickyNote,
  Waypoints,
  type LucideIcon,
} from "lucide-react"
import type { Dictionary } from "./i18n/dictionary"
import type { KnowledgeKind } from "./types"

/** A destination carries the KEY of its label, never the label itself.
 *  A hard-coded string here would be the one English word left in a
 *  Portuguese rail, and `keyof Dictionary["nav"]` makes a typo in that
 *  key a compile error rather than a blank nav row. */
export interface NavItem {
  href: string
  labelKey: keyof Dictionary["nav"]
  icon: LucideIcon
}

/* ── Navigation ─────────────────────────────────────────────────────
 * Not one flat list. The rail gives Search and Ask their own tier
 * because they are the two doors into the knowledge itself, and
 * everything below is browsing: a place to go when you do not yet have
 * a question. A flat list of equals is what made the rail read as an
 * admin panel, and it also buried the two things the product is for.
 *
 * Search is absent from every list here on purpose — it is an action,
 * not a route. The rail renders it as a field that opens the command
 * palette (the same engine as ⌘K). */

/** Browsing destinations, in the order they make sense: what just
 *  happened, everything, the themes across it, the links between them.
 *  Collections, Audio and Research stay out while they are Coming Soon,
 *  so the rail only advertises what works. */
export const KNOWLEDGE_NAV: NavItem[] = [
  { href: "/knowledge/home", labelKey: "home", icon: Home },
  { href: "/knowledge/library", labelKey: "library", icon: Library },
  { href: "/knowledge/topics", labelKey: "topics", icon: Tag },
  { href: "/knowledge", labelKey: "connections", icon: Waypoints },
]

/** The one door that is a route. Rendered above the browse list, at a
 *  weight none of them get. */
export const KNOWLEDGE_ASK: NavItem = { href: "/knowledge/ai", labelKey: "ask", icon: Sparkles }

/** A saved filter, not a pillar — below the rule. */
export const KNOWLEDGE_SECONDARY_NAV: NavItem[] = [
  { href: "/knowledge/favorites", labelKey: "favorites", icon: Heart },
]

/** The mobile bar. Four destinations and no action: Save and Search
 *  both live in the mobile header, and a floating accent button for a
 *  third copy of Save was the loudest thing on every phone screen. */
export const MOBILE_NAV: NavItem[] = [
  { href: "/knowledge/home", labelKey: "home", icon: Home },
  { href: "/knowledge/library", labelKey: "library", icon: Library },
  { href: "/knowledge/ai", labelKey: "ask", icon: Sparkles },
  { href: "/knowledge", labelKey: "connections", icon: Waypoints },
]

interface KindMeta {
  icon: LucideIcon
}

/** Icons only. The names live in the dictionary under `kinds`, keyed by
 *  the same KnowledgeKind, so a new kind cannot ship without both. */
export const KIND_META: Record<KnowledgeKind, KindMeta> = {
  article: { icon: FileText },
  video: { icon: Video },
  pdf: { icon: FileType2 },
  podcast: { icon: Mic },
  social: { icon: MessageSquare },
  document: { icon: StickyNote },
}

/** Ask the Knowledge shell to open the Save dialog from anywhere. */
export function openSaveDialog(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("knowledge:save"))
}

/** Ask the Knowledge shell to open the command palette from anywhere. */
export function openCommandPalette(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("knowledge:command"))
}

/** Build a link into the Ask experience with the composer pre-filled.
 *  Only the `q` query string is passed — the exact input the existing
 *  askKnowledge() flow already accepts. No per-item or per-topic scope is
 *  invented: the question text itself carries the intent, and the Ask
 *  surface still shows its real state (including "unavailable") on submit.
 *  The question is never auto-run, so nothing is simulated. */
/* The URL builders live in ./links.ts — no imports, so they can be
 * unit-tested; re-exported here because callers have always reached
 * them through config. */
export { askAboutConceptHref, askAboutHref, conceptHref, topicItemsHref } from "./links"
/* Formatting lives in ./i18n/format — it must stay loadable without
 * React (this module imports lucide-react). Re-exported here only so
 * a caller that already needs KIND_META has one import, not two. */
export { durationLabel, kindLabel, savedAgo } from "./i18n/format"

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/knowledge") return pathname === "/knowledge"
  return pathname === href || pathname.startsWith(`${href}/`)
}


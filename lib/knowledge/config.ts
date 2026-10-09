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
import type { KnowledgeKind } from "./types"

export interface NavItem {
  href: string
  label: string
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
  { href: "/knowledge/home", label: "Home", icon: Home },
  { href: "/knowledge/library", label: "Library", icon: Library },
  { href: "/knowledge/topics", label: "Topics", icon: Tag },
  { href: "/knowledge", label: "Connections", icon: Waypoints },
]

/** The one door that is a route. Rendered above the browse list, at a
 *  weight none of them get. */
export const KNOWLEDGE_ASK: NavItem = { href: "/knowledge/ai", label: "Ask", icon: Sparkles }

/** A saved filter, not a pillar — below the rule. */
export const KNOWLEDGE_SECONDARY_NAV: NavItem[] = [
  { href: "/knowledge/favorites", label: "Favorites", icon: Heart },
]

/** The mobile bar. Four destinations and no action: Save and Search
 *  both live in the mobile header, and a floating accent button for a
 *  third copy of Save was the loudest thing on every phone screen. */
export const MOBILE_NAV: NavItem[] = [
  { href: "/knowledge/home", label: "Home", icon: Home },
  { href: "/knowledge/library", label: "Library", icon: Library },
  { href: "/knowledge/ai", label: "Ask", icon: Sparkles },
  { href: "/knowledge", label: "Connections", icon: Waypoints },
]

interface KindMeta {
  label: string
  icon: LucideIcon
}

export const KIND_META: Record<KnowledgeKind, KindMeta> = {
  article: { label: "Article", icon: FileText },
  video: { label: "Video", icon: Video },
  pdf: { label: "PDF", icon: FileType2 },
  podcast: { label: "Podcast", icon: Mic },
  social: { label: "Post", icon: MessageSquare },
  document: { label: "Note", icon: StickyNote },
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

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/knowledge") return pathname === "/knowledge"
  return pathname === href || pathname.startsWith(`${href}/`)
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** "Saved 2 days ago" style, computed against the real current time. */
export function savedAgo(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const days = Math.round((then.getTime() - now.getTime()) / 86_400_000)
  if (days === 0) return "Saved today"
  if (days === -1) return "Saved yesterday"
  if (days > -7) return `Saved ${RELATIVE.format(days, "day")}`
  const weeks = Math.round(days / 7)
  return `Saved ${RELATIVE.format(weeks, "week")}`
}

export function durationLabel(kind: KnowledgeKind, min?: number): string | null {
  if (!min) return null
  if (kind === "podcast" || kind === "video") return `${min} min`
  return `${min} min read`
}

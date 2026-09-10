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
  type LucideIcon,
} from "lucide-react"
import type { KnowledgeKind } from "./types"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

/** Primary Knowledge navigation — only real, shipped destinations. The
 *  order narrates the product: capture (Home/Library), organise (Topics),
 *  ask (Ask). Search is not here because it is an action, not a route —
 *  the sidebar renders it inline as a button that opens the command
 *  palette. Collections, Audio and Research are intentionally omitted
 *  while they are Coming Soon, so the menu only advertises what works. */
export const KNOWLEDGE_NAV: NavItem[] = [
  { href: "/knowledge", label: "Home", icon: Home },
  { href: "/knowledge/library", label: "Library", icon: Library },
  { href: "/knowledge/topics", label: "Topics", icon: Tag },
  { href: "/knowledge/ai", label: "Ask", icon: Sparkles },
]

/** Secondary destination — a saved-filter view, not a pillar of its own,
 *  so it sits below the primary nav under a divider. */
export const KNOWLEDGE_SECONDARY_NAV: NavItem[] = [
  { href: "/knowledge/favorites", label: "Favorites", icon: Heart },
]

/** Compact set surfaced in the mobile bottom bar (Search lives in the
 *  persistent top-bar field, reachable on every screen). */
export const MOBILE_NAV: NavItem[] = [
  { href: "/knowledge", label: "Home", icon: Home },
  { href: "/knowledge/library", label: "Library", icon: Library },
  { href: "/knowledge/ai", label: "Ask", icon: Sparkles },
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
export function askAboutHref(question: string): string {
  return `/knowledge/ai?q=${encodeURIComponent(question)}`
}

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

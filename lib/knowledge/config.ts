import {
  Compass,
  FileText,
  Headphones,
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

/** Primary Knowledge navigation (distinct from Workforce's grouped nav). */
export const KNOWLEDGE_NAV: NavItem[] = [
  { href: "/knowledge/home", label: "Home", icon: Home },
  { href: "/knowledge/library", label: "Library", icon: Library },
  { href: "/knowledge/collections", label: "Collections", icon: Compass },
  { href: "/knowledge/topics", label: "Topics", icon: Tag },
  { href: "/knowledge/favorites", label: "Favorites", icon: Heart },
  { href: "/knowledge/audio", label: "Audio", icon: Headphones },
  { href: "/knowledge/ai", label: "AI", icon: Sparkles },
  { href: "/knowledge/research", label: "Research", icon: FileText },
]

/** Compact set surfaced in the mobile bottom bar. */
export const MOBILE_NAV: NavItem[] = [
  { href: "/knowledge/home", label: "Home", icon: Home },
  { href: "/knowledge/library", label: "Library", icon: Library },
  { href: "/knowledge/audio", label: "Audio", icon: Headphones },
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

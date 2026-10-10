/* ================================================================== *
 * ADAPTER — the seam between the database row shape (lib/knowledge/
 * repo.ts) and the presentation shape the React components are typed
 * against (lib/knowledge/types.ts). Components never import a row type
 * and never see snake_case DB columns; the domain layer never imports
 * React. This file is pure and isomorphic (no server-only), so it can
 * run wherever the mapping is convenient.
 * ================================================================== */

import type { KnowledgeRow } from "./repo"
import type { KnowledgeDocument, KnowledgeItem, KnowledgeState, Topic } from "./types"

const VALID_STATES: KnowledgeState[] = ["saved", "fetching", "extracting", "ready", "failed"]

function toState(raw: string): KnowledgeState {
  return (VALID_STATES as string[]).includes(raw) ? (raw as KnowledgeState) : "saved"
}

function toKind(raw: string): KnowledgeItem["kind"] {
  const kinds = ["article", "video", "pdf", "podcast", "social", "document"]
  return (kinds.includes(raw) ? raw : "article") as KnowledgeItem["kind"]
}

/** Row → card-level item (no heavy body text). */
export function rowToItem(row: KnowledgeRow, tags: string[] = []): KnowledgeItem {
  const domain = row.domain ?? undefined
  return {
    id: row.id,
    kind: toKind(row.kind),
    state: toState(row.status),
    readState: row.read_at ? "read" : "unread",
    favorite: row.favorite,
    archived: row.archived,
    url: row.url,
    domain,
    title: row.title ?? (domain ? `Saving from ${domain}…` : "Saving…"),
    excerpt: row.excerpt ?? undefined,
    aiSummary: row.summary ?? undefined,
    source: row.site_name ?? domain ?? "Unknown source",
    author: row.author ?? undefined,
    cover: row.image_url ?? undefined,
    favicon: row.favicon ?? undefined,
    topics: tags,
    durationMin: row.reading_min ?? undefined,
    error: row.error ?? undefined,
    savedAt: new Date(Number(row.created_at)).toISOString(),
  }
}

/** Row → full reader document (includes extracted body text). */
export function rowToDocument(row: KnowledgeRow, tags: string[] = []): KnowledgeDocument {
  return {
    ...rowToItem(row, tags),
    contentText: row.content_text ?? undefined,
    // Extracted by extract.ts and stored by repo.ts since the column
    // existed; it simply was not carried across this boundary, so it
    // never reached the Reader.
    lang: row.lang ?? undefined,
    publishedAt: row.published_at ? new Date(Number(row.published_at)).toISOString() : undefined,
    wordCount: row.word_count ?? undefined,
    attempts: row.attempts,
  }
}

/** Tag counts → Topic[] with a relative momentum for subtle emphasis. */
export function tagsToTopics(tagCounts: { tag: string; count: number }[]): Topic[] {
  const max = tagCounts.reduce((m, t) => Math.max(m, t.count), 1)
  return tagCounts.map((t) => ({
    id: t.tag.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label: t.tag,
    count: t.count,
    momentum: t.count / max,
  }))
}

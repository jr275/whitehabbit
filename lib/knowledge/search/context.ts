/* ================================================================== *
 * CONTEXT ASSEMBLY — between retrieval and the model.
 *
 * Retrieval returns ranked chunks. A prompt needs prose with markers,
 * a token budget that is respected rather than hoped for, and a
 * citation list that maps back to real rows. Doing that inside a
 * route would mean doing it again, differently, in the agent API.
 *
 * THE OVERLAP PROBLEM THIS FILE EXISTS TO SOLVE. Chunking (see
 * chunking.ts) deliberately overlaps adjacent chunks by ~120 tokens so
 * a sentence spanning a boundary is retrievable from either side.
 * That is right for retrieval and wrong for a prompt: when two
 * adjacent chunks of the same article both rank, emitting both sends
 * the shared 120 tokens twice — paid for twice, and read by the model
 * as if the passage were repeated for emphasis. Because chunk offsets
 * are exact (content_text.slice(char_start, char_end) === text), the
 * overlap can be removed by arithmetic rather than by fuzzy text
 * matching: merge the ranges, and splice the second chunk's text at
 * the point the first one ended.
 *
 * Pure and dependency-free on purpose — every branch here is testable
 * without a database, a provider, or a fixture corpus.
 * ================================================================== */

import { estimateTokens } from "../chunking"
import { buildExcerpt, type KnowledgeCitation } from "./citations"
import type { RetrievedChunk } from "./types"

/** A contiguous span of one item's content, possibly built from
 *  several overlapping chunks. */
export interface AssembledPassage {
  citationId: string
  knowledgeItemId: string
  /** Every chunk merged into this passage, best-scoring first. */
  chunkIds: string[]
  text: string
  charStart: number | null
  charEnd: number | null
  /** Best score among the merged chunks. */
  score: number
}

export interface AssembledContext {
  /** Prompt-ready block. Empty string when nothing fit or nothing was
   *  retrieved — callers must treat that as "no evidence", never as
   *  permission to answer from the model's own memory. */
  text: string
  passages: AssembledPassage[]
  citations: KnowledgeCitation[]
  usedTokens: number
  budgetTokens: number
  /** Chunks retrieval returned that did not reach the context, either
   *  because they merged into a passage that was dropped or because
   *  the budget ran out. Surfaced so a caller can tell a thin answer
   *  from a truncated one. */
  droppedChunks: number
}

export interface AssembleContextInput {
  query: string
  chunks: readonly RetrievedChunk[]
  maxTokens?: number
}

/** Room for roughly a dozen full passages, leaving the rest of a
 *  200k-token window for instructions, history and the answer. The
 *  budget exists to bound cost per question, not to fill the model. */
export const DEFAULT_CONTEXT_TOKENS = 6000

/** Header line per passage ("[1] Title — https://…") plus the blank
 *  line separating it from the next. Counted against the budget
 *  because a budget that ignores its own formatting is not a budget. */
function renderPassage(passage: AssembledPassage, citation: KnowledgeCitation): string {
  const source = citation.sourceUrl ? ` — ${citation.sourceUrl}` : ""
  return `[${passage.citationId}] ${citation.title}${source}\n${passage.text}`
}

interface Span {
  start: number
  end: number
  text: string
  members: RetrievedChunk[]
}

/**
 * Merge chunks of ONE item whose character ranges touch or overlap.
 *
 * Chunks arrive sorted by charStart. `text` is grown by appending only
 * the part of the next chunk that lies beyond the current end, which
 * is exact rather than heuristic because both chunks are slices of the
 * same string at known offsets.
 */
function mergeSpans(chunks: RetrievedChunk[]): Span[] {
  const spans: Span[] = []
  for (const chunk of chunks) {
    const start = chunk.charStart!
    const end = chunk.charEnd!
    const current = spans[spans.length - 1]

    if (!current || start > current.end) {
      spans.push({ start, end, text: chunk.snippet, members: [chunk] })
      continue
    }

    current.members.push(chunk)
    // Fully contained in what we already have: nothing to append.
    if (end <= current.end) continue

    // Clamp defensively. The offsets contract makes `offset` land
    // inside the snippet, but a row written before that contract
    // existed must degrade to a duplicated sentence, never to a
    // sliced-off character or a thrown error mid-answer.
    const offset = Math.min(Math.max(current.end - start, 0), chunk.snippet.length)
    current.text += chunk.snippet.slice(offset)
    current.end = end
  }
  return spans
}

/**
 * Turn ranked chunks into a prompt block, a citation list, and an
 * honest account of what was left out.
 *
 * Order is by relevance, not by document position: the best evidence
 * is what survives if the budget is tight. Passages that do not fit
 * are skipped rather than truncated — half a passage cited as whole
 * evidence is worse than one passage fewer.
 */
export function assembleKnowledgeContext(input: AssembleContextInput): AssembledContext {
  const budgetTokens = Math.max(1, input.maxTokens ?? DEFAULT_CONTEXT_TOKENS)

  const usable = input.chunks.filter((c) => c.snippet.trim().length > 0)
  const totalChunks = usable.length

  // Group by item so only same-document ranges are ever merged.
  const byItem = new Map<string, RetrievedChunk[]>()
  for (const chunk of usable) {
    const bucket = byItem.get(chunk.knowledgeItemId)
    if (bucket) bucket.push(chunk)
    else byItem.set(chunk.knowledgeItemId, [chunk])
  }

  const spans: { itemId: string; span: Span }[] = []
  for (const [itemId, group] of byItem) {
    // Chunks without offsets cannot be merged safely — they predate
    // the offsets contract or came from a caller that dropped them.
    // Each stands alone rather than being spliced on a guess.
    const positioned = group
      .filter((c) => c.charStart !== null && c.charEnd !== null)
      .sort((a, b) => a.charStart! - b.charStart! || a.charEnd! - b.charEnd!)
    const loose = group.filter((c) => c.charStart === null || c.charEnd === null)

    for (const span of mergeSpans(positioned)) spans.push({ itemId, span })
    for (const chunk of loose) {
      spans.push({
        itemId,
        span: { start: -1, end: -1, text: chunk.snippet, members: [chunk] },
      })
    }
  }

  // Back to relevance order: a span is as relevant as its best chunk.
  // chunkId breaks ties so the same retrieval always assembles the
  // same context — a prompt that varies run to run cannot be debugged.
  const ranked = spans
    .map(({ itemId, span }) => {
      const members = [...span.members].sort((a, b) => b.score - a.score || (a.chunkId < b.chunkId ? -1 : 1))
      return { itemId, span, members, score: members[0].score }
    })
    .sort((a, b) => b.score - a.score || (a.members[0].chunkId < b.members[0].chunkId ? -1 : 1))

  const passages: AssembledPassage[] = []
  const citations: KnowledgeCitation[] = []
  const citationByItem = new Map<string, KnowledgeCitation>()
  const rendered: string[] = []
  let usedTokens = 0
  let includedChunks = 0

  for (const entry of ranked) {
    const best = entry.members[0]
    const existing = citationByItem.get(entry.itemId)
    const citationId = existing?.citationId ?? String(citationByItem.size + 1)

    const passage: AssembledPassage = {
      citationId,
      knowledgeItemId: entry.itemId,
      chunkIds: entry.members.map((m) => m.chunkId),
      text: entry.span.text,
      charStart: entry.span.start >= 0 ? entry.span.start : null,
      charEnd: entry.span.end >= 0 ? entry.span.end : null,
      score: entry.score,
    }

    const citation: KnowledgeCitation =
      existing ??
      {
        citationId,
        knowledgeItemId: entry.itemId,
        chunkId: best.chunkId,
        chunkIds: [],
        title: best.title?.trim() || best.metadata.url,
        sourceUrl: best.metadata.url || undefined,
        excerpt: buildExcerpt(entry.span.text),
        relevanceScore: entry.score,
      }

    const block = renderPassage(passage, citation)
    const cost = estimateTokens(block) + 2 // the blank line between blocks
    // Skip, do not stop: a later passage may still fit, and dropping
    // the rest of the evidence because one long article did not fit
    // would silently narrow the answer.
    if (usedTokens + cost > budgetTokens) continue

    usedTokens += cost
    includedChunks += entry.members.length
    passages.push(passage)
    rendered.push(block)

    if (!existing) {
      citationByItem.set(entry.itemId, citation)
      citations.push(citation)
    }
    citation.chunkIds.push(...passage.chunkIds)
  }

  return {
    text: rendered.join("\n\n"),
    passages,
    citations,
    usedTokens,
    budgetTokens,
    droppedChunks: totalChunks - includedChunks,
  }
}

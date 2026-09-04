/* ================================================================== *
 * CITATIONS — a first-class type, not a formatting convention.
 *
 * The reason this is a structure and not a string in a prompt: an
 * answer that says "according to your saved research" is unverifiable,
 * and an answer that says "[2]" is only verifiable if [2] resolves,
 * deterministically, back to a passage the user actually saved. So a
 * citation carries the identifiers needed to re-fetch its evidence —
 * the item, and the specific chunks the text came from — and the UI
 * and the agent API both render from the same object rather than each
 * inventing a marker syntax.
 *
 * Numbering is assigned by context assembly, in the order passages
 * appear in the assembled context, so the marker the model sees and
 * the marker the reader clicks are the same marker.
 * ================================================================== */

export interface KnowledgeCitation {
  /** Marker shown to the model and the reader: "1", "2", … Stable
   *  within one assembled context, meaningless outside it. */
  citationId: string
  knowledgeItemId: string
  /** The highest-ranked chunk behind this citation. Present whenever
   *  the citation came from retrieval; absent only if a future caller
   *  cites a whole item. */
  chunkId?: string
  /** Every chunk of this item that reached the context. A merged
   *  passage covers more than one, and dropping that would break the
   *  claim → chunk mapping for exactly the passages most worth
   *  checking. */
  chunkIds: string[]
  title: string
  sourceUrl?: string
  excerpt?: string
  /** Retrieval score of the best chunk. Ranking signal only — not a
   *  confidence, and not comparable across queries. */
  relevanceScore?: number
}

const EXCERPT_CHARS = 240

/** A short, whole-word excerpt for display. Never used as evidence —
 *  the chunk ids are what a verifier follows. */
export function buildExcerpt(text: string, limit = EXCERPT_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** The marker as it appears in prompt text and in an answer. One
 *  function so the model's format and the parser's format cannot
 *  drift apart. */
export function citationMarker(citationId: string): string {
  return `[${citationId}]`
}

/** Citation ids actually referenced by a piece of generated text, in
 *  order of first appearance. Used to drop citations the model never
 *  used, and to catch markers that point at nothing. */
export function extractCitationIds(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(/\[(\d{1,3})\]/g)) {
    const id = match[1]
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/* ================================================================== *
 * CHUNKING — turning one extracted document into the passages
 * retrieval actually works on.
 *
 * PURE, AND DELIBERATELY SO. No database, no provider, no clock, no
 * randomness. The same string always produces the same chunks, byte
 * for byte and offset for offset. That is not tidiness: re-indexing
 * an unchanged document has to be a no-op, and it can only be a
 * no-op if chunking is a function rather than a process.
 *
 * THE INVARIANT THIS FILE EXISTS TO KEEP:
 *
 *     content.slice(chunk.charStart, chunk.charEnd) === chunk.text
 *
 * for every chunk, always. Offsets are half-open [start, end) and
 * index into the ORIGINAL content_text — not into a normalised copy.
 * That is what lets a citation point at a span of the source the
 * Reader is already rendering, so the passage an answer used can be
 * highlighted in place. The moment chunk text is trimmed, collapsed
 * or normalised without moving the offsets with it, citations start
 * pointing at the wrong words and nothing downstream can detect it.
 * Every test in tests/knowledge/chunking.test.ts checks this.
 *
 * Offsets are JavaScript string indices, i.e. UTF-16 code units —
 * the same unit String.prototype.slice takes, which is what makes
 * the invariant above true by construction rather than by luck.
 * ================================================================== */

/** One passage of a document, traceable to the exact span it came from. */
export interface Chunk {
  /** 0-based position in reading order. With item_id this is the
   *  chunk's identity — see uq_knowledge_chunks_item_ordinal. */
  ordinal: number
  text: string
  charStart: number
  charEnd: number
  tokenEstimate: number
}

export interface ChunkOptions {
  targetTokens: number
  overlapTokens: number
  /** A chunk smaller than this is merged rather than emitted alone. */
  minTokens: number
}

/* ---- sizing ------------------------------------------------------ *
 *
 * TOKENS ARE ESTIMATED, NOT COUNTED, and this file will not pretend
 * otherwise. There is no tokenizer in this project and adding one
 * for a budgeting number would be a dependency bought for very
 * little: the estimate decides how much text to put in a chunk and
 * how many chunks fit in a prompt, and both have slack in them.
 *
 * The approximation is 4 characters per token. It is the standard
 * rough figure for English prose in a byte-pair vocabulary, and it
 * is deterministic, which matters more here than being tight. Two
 * known biases, stated rather than hidden: code and heavily
 * punctuated text run FEWER characters per token (the estimate
 * under-counts), and CJK text runs closer to one token per
 * character (the estimate under-counts badly). Both err toward
 * chunks that are larger in real tokens than the target, so the
 * context budget in a later phase must treat this as a floor, not a
 * guarantee.
 *
 * 900 target / 120 overlap, in tokens. The target sits at the upper
 * end of the 700-1000 range because this corpus is saved articles:
 * whole arguments rather than reference snippets, where a passage
 * that carries its own context retrieves better than a tight one.
 * At ~3,600 characters a chunk, a typical long article yields a
 * handful of chunks rather than dozens, which keeps both the
 * embedding bill and the reranking work proportionate. The overlap
 * is ~13% — enough that a claim spanning a boundary survives in at
 * least one chunk whole, without paying to embed everything twice.
 * For scale: lib/knowledge/ai-summary.ts caps a whole document at
 * MAX_INPUT_CHARS = 12,000, so a target of 3,600 splits that into
 * roughly four overlapping passages.
 * ------------------------------------------------------------------ */

const CHARS_PER_TOKEN = 4

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  targetTokens: 900,
  overlapTokens: 120,
  minTokens: 100,
}

/** The documented approximation above. Never a provider tokenizer. */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN))
}

/* ---- boundary finding -------------------------------------------- */

/** True when cutting immediately before `index` would split a
 *  surrogate pair or strand a combining mark from its base. A hard
 *  cut is already a last resort; landing it inside a character would
 *  make it a corrupting one. */
function splitsACharacter(content: string, index: number): boolean {
  if (index <= 0 || index >= content.length) return false
  const before = content.charCodeAt(index - 1)
  // High surrogate immediately before the cut: its low half is on the
  // other side.
  if (before >= 0xd800 && before <= 0xdbff) return true
  // A combining mark at the cut belongs to the character before it.
  return /\p{M}/u.test(content[index])
}

/** Walks a hard cut backwards until it no longer splits a character.
 *  Bounded by `floor` so it can never move past the chunk's start. */
function safeHardCut(content: string, index: number, floor: number): number {
  let cut = index
  while (cut > floor && splitsACharacter(content, cut)) cut -= 1
  return cut
}

/**
 * The end offset for a chunk starting at `start`, preferring the most
 * meaningful boundary available at or before `limit`.
 *
 * The order — paragraph, sentence, whitespace, hard — is the order of
 * how much meaning the boundary preserves. Each is searched only in
 * the window [earliest, limit]: a paragraph break three characters
 * into the chunk is a worse cut than a sentence break near the
 * target, so a boundary is only accepted if it produces a chunk of
 * respectable size. Without that floor, a document of short lines
 * would chunk into single lines.
 */
function findBoundary(content: string, start: number, limit: number, earliest: number): number {
  const window = content.slice(start, limit)

  // 1. Paragraph: a blank line. The end offset lands AFTER the break
  //    so the whitespace stays attached to the chunk that precedes
  //    it — every character of the source belongs to exactly one
  //    chunk's span, and none is silently dropped between them.
  const paragraph = window.search(/\n[ \t]*\n(?![\s\S]*\n[ \t]*\n)/)
  if (paragraph >= 0) {
    const match = /\n[ \t]*\n/.exec(window.slice(paragraph))
    if (match) {
      const end = start + paragraph + match[0].length
      if (end >= earliest) return end
    }
  }

  // 2. Sentence: terminal punctuation followed by a space. Requiring
  //    the space is what stops "e.g." and "Ph.D." from being read as
  //    sentence ends.
  let sentence = -1
  const sentenceRe = /[.!?…]["')\]]?\s/gu
  for (let m = sentenceRe.exec(window); m !== null; m = sentenceRe.exec(window)) {
    const end = start + m.index + m[0].length
    if (end >= earliest && end <= limit) sentence = end
  }
  if (sentence > 0) return sentence

  // 3. Whitespace: any word boundary, so a cut at least falls between
  //    words rather than inside one.
  const space = window.search(/\s(?![\s\S]*\s)/)
  if (space >= 0) {
    const end = start + space + 1
    if (end >= earliest) return end
  }

  // 4. Hard cut. Reached by a single unbroken run longer than the
  //    target — a minified script, a base64 blob, a language written
  //    without spaces. Splitting it is still better than emitting one
  //    unbounded chunk, but it must not split a character.
  return safeHardCut(content, limit, earliest)
}

/* ---- the chunker ------------------------------------------------- */

/**
 * Splits `content` into overlapping, offset-preserving chunks.
 *
 * Returns [] for content that has nothing to retrieve — empty or
 * whitespace only. An empty result is a real answer here, not a
 * failure: an item whose extraction produced no prose has no
 * passages, and inventing one would put an empty chunk into the
 * index for the retriever to find.
 */
export function chunkContent(content: string, options: Partial<ChunkOptions> = {}): Chunk[] {
  const { targetTokens, overlapTokens, minTokens } = { ...DEFAULT_CHUNK_OPTIONS, ...options }
  const targetChars = targetTokens * CHARS_PER_TOKEN
  const overlapChars = overlapTokens * CHARS_PER_TOKEN
  const minChars = minTokens * CHARS_PER_TOKEN

  if (content.trim().length === 0) return []

  // The whole document fits: one chunk, spanning it exactly.
  if (content.length <= targetChars) {
    return [{ ordinal: 0, text: content, charStart: 0, charEnd: content.length, tokenEstimate: estimateTokens(content) }]
  }

  const chunks: Chunk[] = []
  let start = 0

  while (start < content.length) {
    const limit = Math.min(start + targetChars, content.length)

    // The tail is short enough to be part of this chunk rather than a
    // stub of its own. Emitting it separately would produce exactly
    // the pathological tiny chunk this guards against — a fragment
    // with too little context to retrieve on, and one more row and
    // embedding to pay for.
    if (content.length - start <= targetChars + minChars) {
      const text = content.slice(start)
      chunks.push({ ordinal: chunks.length, text, charStart: start, charEnd: content.length, tokenEstimate: estimateTokens(text) })
      break
    }

    // A boundary is only worth taking past this point; before it, the
    // chunk would be too small to be useful.
    const earliest = Math.min(start + minChars, limit)
    const end = findBoundary(content, start, limit, earliest)

    const text = content.slice(start, end)
    chunks.push({ ordinal: chunks.length, text, charStart: start, charEnd: end, tokenEstimate: estimateTokens(text) })

    // Step back by the overlap, landing on a word boundary where one
    // is close, so the repeated text starts mid-sentence rather than
    // mid-word. Snapping is bounded and deterministic.
    let next = Math.max(end - overlapChars, start + 1)
    if (next > start + 1 && next < end) {
      const snap = content.lastIndexOf(" ", next)
      if (snap > start && next - snap <= 64) next = snap + 1
    }
    // Progress is guaranteed: `next` is strictly greater than `start`
    // by construction, so this terminates on every input.
    start = next
  }

  return chunks
}

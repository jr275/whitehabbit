import "server-only"

/* ================================================================== *
 * ASK YOUR LIBRARY — a grounded answer over the pieces THIS user saved.
 *
 * Not a chatbot. There is no conversation, no memory, and no general
 * knowledge: one question in, one answer out, and the answer may only
 * use text that is already in the user's own library. When the library
 * has nothing to say, the honest answer is that it has nothing to say.
 *
 * RETRIEVAL, AND WHY IT IS DELIBERATELY SMALL
 *
 * repo.searchItems() already does the hard part: a ranked, (org, user)-
 * scoped search across title, domain, site name, excerpt, author, tags
 * and the extracted content_text. Reusing it means the answer can only
 * ever see rows the same tenant filter would return anywhere else in
 * the product — the isolation is not re-implemented here, so it cannot
 * drift from the rest of Knowledge.
 *
 * What it cannot do is take a whole sentence: it matches one substring,
 * so "What have I saved about AI agents?" finds nothing as a phrase.
 * So the question is reduced to content words and each is searched
 * separately, then the results are merged with items matching more of
 * the question ranked higher. That is ordinary keyword retrieval — no
 * embeddings, no vector store, nothing to keep in sync with the rows.
 * It is the smallest thing that is correct, and it is honest about the
 * cases it misses (a question whose words never appear in the library
 * returns no evidence rather than a plausible guess).
 *
 * CITATIONS ARE ENFORCED, NOT REQUESTED
 *
 * The model is asked to mark claims with [1], [2] … and those markers
 * are then resolved HERE against the exact set of documents that were
 * sent. A marker pointing at anything else is dropped. The model can
 * therefore not invent a source: an invented number resolves to nothing
 * and never reaches the user as a citation.
 * ================================================================== */

import { logger } from "@/lib/observability/logger"
import { callAnthropic, isAiConfigured, type AiSummaryDeps } from "./ai-summary"
import * as repo from "./repo"
import type { KnowledgeRow } from "./repo"

/** Answering across several documents with citations is a reasoning
 *  job, so this defaults higher than the summary path. LLM_MODEL, when
 *  the deployment sets one, still wins. */
const ASK_MODEL = process.env.LLM_MODEL || "claude-opus-5"

/** Bounded so one question can never become an outsized-cost outlier.
 *  Six pieces is enough to compare and contrast; past that the answer
 *  gets vaguer, not better. */
export const MAX_DOCUMENTS = 6
/** Per-document, so one very long article cannot crowd out the other
 *  five. Roughly the first few thousand words — the part of an article
 *  that actually states its argument. */
export const MAX_CHARS_PER_DOCUMENT = 6_000
/** Whole-prompt ceiling, enforced after the per-document one. */
export const MAX_TOTAL_CONTEXT_CHARS = 24_000
export const MAX_QUESTION_CHARS = 500
const MAX_ANSWER_TOKENS = 2_000
const MAX_SEARCH_TERMS = 8

/** Words that carry no retrieval signal. Small on purpose: an
 *  aggressive list starts eating real query terms ("about" is noise,
 *  "search" might be the subject). */
const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","but","by","can","did","do","does","for","from","had","has","have",
  "how","i","if","in","into","is","it","its","me","my","of","on","or","that","the","their","them","then",
  "there","these","they","this","those","to","was","were","what","when","where","which","who","why","will",
  "with","you","your","about","across","any","all","been","being","between","both","each","more","most",
  "other","some","such","than","too","very","just","tell","show","give","find","saved","save","library",
])

export class AskValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AskValidationError"
  }
}

export class AskNotConfiguredError extends Error {
  constructor() {
    super("Ask isn't configured for this deployment.")
    this.name = "AskNotConfiguredError"
  }
}

export interface AskCitation {
  /** 1-based marker as it appears in the answer text. */
  marker: number
  itemId: string
  title: string
  domain: string | null
  url: string
}

export interface AskResult {
  answer: string
  citations: AskCitation[]
  /** Every piece that was sent to the model, cited or not — so the UI
   *  can say what was looked at, not only what was quoted. */
  consulted: { itemId: string; title: string }[]
  /** How the documents were chosen. "recent" means the question had no
   *  usable search terms (or matched nothing) and the most recently
   *  saved pieces were used instead; the UI says so rather than
   *  implying a targeted search happened. */
  retrieval: "search" | "recent" | "none"
}

export interface AskDeps extends AiSummaryDeps {
  /** Test seam. Defaults to the real repository. */
  search?: typeof repo.searchItems
  recent?: typeof repo.listItems
}

/* ── Retrieval ────────────────────────────────────────────────────── */

/** Content words, longest first: a longer word is a more selective
 *  search term, and only the first few are used. */
export function extractSearchTerms(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  const unique = [...new Set(words)]
  unique.sort((a, b) => b.length - a.length)
  return unique.slice(0, MAX_SEARCH_TERMS)
}

/** Only rows with something to read. A row whose extraction failed has
 *  a title and nothing else; answering from titles alone is exactly the
 *  kind of confident guess this feature must not make. */
function hasReadableText(row: KnowledgeRow): boolean {
  return !!(row.content_text && row.content_text.trim().length > 0)
}

/** The text actually sent for one row, in the order the brief asks for:
 *  real extracted text first, then the summary, then the excerpt. */
function documentText(row: KnowledgeRow): string {
  const body = row.content_text?.trim()
  if (body) return body.slice(0, MAX_CHARS_PER_DOCUMENT)
  const fallback = row.summary?.trim() || row.excerpt?.trim() || ""
  return fallback.slice(0, MAX_CHARS_PER_DOCUMENT)
}

/**
 * Chooses the pieces that will ground the answer.
 *
 * Exported for tests: the selection is the part with real logic, and it
 * is worth asserting on without a model or a network in the way.
 */
export async function selectDocuments(
  params: { orgId: string; userId: string | null; question: string },
  deps: AskDeps = {},
): Promise<{ rows: KnowledgeRow[]; retrieval: AskResult["retrieval"] }> {
  const search = deps.search ?? repo.searchItems
  const recent = deps.recent ?? repo.listItems
  const terms = extractSearchTerms(params.question)

  // Score by how many DISTINCT question words a piece matches. An
  // article that matches "claude" and "agents" beats one that matches
  // "agents" alone, which is the closest thing to relevance available
  // without an index that understands meaning.
  const hits = new Map<string, { row: KnowledgeRow; matched: number }>()
  for (const term of terms) {
    const rows = await search(params.orgId, params.userId, term, MAX_DOCUMENTS * 3)
    for (const row of rows) {
      const seen = hits.get(row.id)
      if (seen) seen.matched += 1
      else hits.set(row.id, { row, matched: 1 })
    }
  }

  const ranked = [...hits.values()]
    .filter((h) => hasReadableText(h.row))
    .sort((a, b) => (b.matched !== a.matched ? b.matched - a.matched : Number(b.row.created_at) - Number(a.row.created_at)))
    .slice(0, MAX_DOCUMENTS)
    .map((h) => h.row)

  if (ranked.length > 0) return { rows: ranked, retrieval: "search" }

  // Nothing matched — either the question is broad ("what are the main
  // ideas across my saves?") or its words simply are not in the
  // library. Fall back to the most recent readable pieces and let the
  // UI say that is what happened, rather than silently pretending the
  // search found them.
  const { rows } = await recent(params.orgId, params.userId, { limit: MAX_DOCUMENTS * 3, offset: 0 })
  const readable = rows.filter(hasReadableText).slice(0, MAX_DOCUMENTS)
  return { rows: readable, retrieval: readable.length > 0 ? "recent" : "none" }
}

/* ── Prompt ───────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = [
  "You answer questions about a personal reading library, using only the saved pieces provided.",
  "",
  "Rules, in order of importance:",
  "1. Use only what the provided pieces say. Never add outside knowledge, even if you are confident it is true.",
  "2. Mark every claim with the number of the piece it came from, like [2]. A sentence drawing on two pieces gets [1][3].",
  "3. Never cite a number that was not provided to you.",
  "4. If the pieces do not answer the question, say so plainly in one sentence and stop. Do not pad with what they do cover unless it is genuinely close.",
  "5. Write plain prose for a person, not a report. No headings, no preamble like 'Based on the provided documents'. Two short paragraphs at most unless the question asks you to compare several pieces.",
  "6. If the pieces disagree, say so and cite both sides.",
].join("\n")

/** The prompt body. Exported so a test can assert what is and is not
 *  sent — a piece's URL and internal id never are. */
export function buildPrompt(question: string, rows: KnowledgeRow[]): string {
  const parts = rows.map((row, i) => {
    const header = [
      `[${i + 1}] ${row.title?.trim() || "(untitled)"}`,
      row.site_name?.trim() || row.domain || null,
      row.author?.trim() || null,
    ]
      .filter(Boolean)
      .join(" — ")
    return `${header}\n${documentText(row)}`
  })

  let context = ""
  for (const part of parts) {
    if (context.length + part.length > MAX_TOTAL_CONTEXT_CHARS) break
    context += (context ? "\n\n---\n\n" : "") + part
  }
  return `Saved pieces:\n\n${context}\n\n---\n\nQuestion: ${question}`
}

/* ── Citations ────────────────────────────────────────────────────── */

/**
 * Resolves [n] markers against the documents that were actually sent.
 *
 * This is the guarantee, and it is a code guarantee rather than a
 * prompt one: a marker outside the range is dropped, so a hallucinated
 * source cannot become a citation the user sees. Markers are returned
 * in the order they first appear in the answer.
 */
export function resolveCitations(answer: string, rows: KnowledgeRow[]): AskCitation[] {
  const out: AskCitation[] = []
  const seen = new Set<number>()
  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const marker = Number(match[1])
    if (seen.has(marker)) continue
    const row = rows[marker - 1]
    if (!row) continue // invented, or pointing past what was sent
    seen.add(marker)
    out.push({
      marker,
      itemId: row.id,
      title: row.title?.trim() || row.url,
      domain: row.domain,
      url: row.url,
    })
  }
  return out
}

/* ── The capability ───────────────────────────────────────────────── */

export async function askLibrary(
  params: { orgId: string; userId: string | null; question: string },
  deps: AskDeps = {},
): Promise<AskResult> {
  const question = params.question.trim()
  if (!question) throw new AskValidationError("Ask a question about something you've saved.")
  if (question.length > MAX_QUESTION_CHARS) {
    throw new AskValidationError(`Keep the question under ${MAX_QUESTION_CHARS} characters.`)
  }
  if (!isAiConfigured()) throw new AskNotConfiguredError()

  const { rows, retrieval } = await selectDocuments({ ...params, question }, deps)
  if (rows.length === 0) {
    // An empty library, or one where nothing has readable text yet.
    // Answered without calling the model at all: there is nothing to
    // ground an answer in, and saying so costs nothing.
    return {
      answer:
        "There's nothing in your library to answer from yet. Save a few pieces — once their text has been extracted, you can ask about them here.",
      citations: [],
      consulted: [],
      retrieval: "none",
    }
  }

  const answer = await callAnthropic(
    {
      model: ASK_MODEL,
      maxTokens: MAX_ANSWER_TOKENS,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(question, rows),
      logContext: "knowledge_ask",
      userFacingError: "Couldn't answer that right now. Try again.",
    },
    deps,
  )

  const citations = resolveCitations(answer, rows)
  logger.info("knowledge_ask_answered", {
    documents: rows.length,
    citations: citations.length,
    retrieval,
  })

  return {
    answer,
    citations,
    consulted: rows.map((row) => ({ itemId: row.id, title: row.title?.trim() || row.url })),
    retrieval,
  }
}

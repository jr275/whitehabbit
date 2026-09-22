import "server-only"

/* ================================================================== *
 * CONCEPT EXTRACTION — one model call over passages that already exist.
 *
 * WHAT THIS DOES NOT DO, and each omission is the point:
 *   - it does not fetch the page again (ingestion already did),
 *   - it does not chunk (the chunker already did),
 *   - it does not embed (the indexer already did),
 *   - it does not create a second LLM client (lib/ai/llm exists),
 *   - it does not write (the contract validates, the repo writes).
 *
 * It reads chunks the item already has, asks the configured provider
 * what the document is about, and hands the answer to the validation
 * gate. Nothing the model produces reaches the database without going
 * through parseExtraction first.
 *
 * The prompt gives the model chunk ids and demands they come back as
 * evidence. That is what makes a concept checkable: the association
 * points at the passage it was derived from, and a model that cites an
 * id it was not given is caught by the contract rather than believed.
 * ================================================================== */

import { callLlm } from "@/lib/ai/llm"
import { logger } from "@/lib/observability/logger"
import * as repo from "@/lib/knowledge/repo"
import { MAX_CONCEPTS_PER_ITEM, parseExtraction, parseExtractionJson, type ExtractedConcept } from "./contract"
import { replaceItemConcepts, type ConceptScope } from "./repo"

/** How much of a document to send. Concepts live in the opening and the
 *  headings far more often than in the tail, and sending an entire long
 *  article costs tokens to restate what the first passages already say. */
const MAX_CHUNKS = 12
const MAX_CHUNK_CHARS = 900

const SYSTEM_PROMPT = `You identify what a saved document is ABOUT.

You are given numbered passages from one document, each with an id. Return the subjects that document genuinely covers — not every noun in it.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary:
{"concepts":[{"name": string, "type": string, "confidence": number, "evidence": [{"chunkId": string}]}]}

Rules:
- type is exactly one of: TOPIC, CONCEPT, ENTITY, TECHNOLOGY, PERSON, ORGANIZATION, PRODUCT.
- confidence is between 0 and 1, and reflects how central the subject is to THIS document — not how important it is in general.
- evidence must cite the ids of passages you were given, and only those. Never invent an id.
- Every concept needs at least one passage that supports it. If you cannot point at one, leave the concept out.
- Prefer the specific over the generic: "agent tool calling" says more than "technology".
- At most ${MAX_CONCEPTS_PER_ITEM} concepts. If the document is about fewer things, return fewer.
- Return an empty concepts array rather than inventing subjects for a document that says little.`

function buildPrompt(title: string | null, chunks: { id: string; text: string }[]): string {
  const passages = chunks.map((c) => `[${c.id}]\n${c.text.slice(0, MAX_CHUNK_CHARS)}`).join("\n\n")
  return `${title ? `Document title: ${title}\n\n` : ""}Passages:\n\n${passages}\n\nWhat is this document about?`
}

export interface ExtractionOutcome {
  status: "extracted" | "skipped" | "failed"
  written: number
  rejected: number
  reason?: string
  /** Only set when status is "failed", and the distinction decides
   *  whether retrying is worth anything:
   *
   *  "provider" — the model was never reached, or answered with an
   *    error: no credential, an outage, a timeout. Nothing about THIS
   *    document caused it, so the caller must NOT record the job as
   *    done — the item has not been looked at, and the backfill has to
   *    be able to find it again.
   *
   *  "content"  — the model answered and the answer was unusable
   *    (prose instead of JSON, the wrong envelope). Re-asking the same
   *    question about the same text tends to produce the same answer,
   *    so retrying spends tokens to learn nothing. The caller completes
   *    the job instead of burning its attempts. */
  failure?: "provider" | "content"
}

export interface ExtractionDeps {
  /** Seam for tests. Defaults to the shared provider layer — there is
   *  deliberately no second client here. */
  callLlm?: typeof callLlm
}

/**
 * Extracts and persists the concepts for one item.
 *
 * Never throws for an ordinary failure. This runs inside the job queue,
 * where a throw means a retry with backoff; a document the model cannot
 * characterise is not a transient fault and retrying it three times
 * would just spend three times the tokens on the same answer. Real
 * faults (provider down) are returned as "failed" so the caller decides.
 */
export async function extractConceptsForItem(
  itemId: string,
  scope: ConceptScope,
  deps: ExtractionDeps = {},
): Promise<ExtractionOutcome> {
  const call = deps.callLlm ?? callLlm

  // Owner-scoped read. An item that is not this scope's returns nothing
  // here, so extraction cannot be pointed at someone else's document
  // even by a caller that got the id wrong.
  const chunks = await repo.getChunks(itemId, scope.orgId, scope.userId)
  if (chunks.length === 0) {
    return { status: "skipped", written: 0, rejected: 0, reason: "no chunks — the item is not indexed yet" }
  }

  const item = await repo.getItem(itemId, scope.orgId, scope.userId)
  const selected = chunks.slice(0, MAX_CHUNKS).map((c) => ({ id: c.id, text: c.text }))
  const knownChunkIds = new Set(selected.map((c) => c.id))

  const result = await call({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(item?.title ?? null, selected),
    maxTokens: 1200,
  })

  if (!result.ok) {
    // not_configured is a deployment state, not a document problem —
    // reported separately so a backfill over a library with no
    // credential does not look like a thousand broken documents.
    const reason = result.reason === "not_configured" ? "no LLM provider configured" : result.message
    return { status: "failed", written: 0, rejected: 0, reason, failure: "provider" }
  }

  const json = parseExtractionJson(result.output.text)
  if (json === null) {
    logger.warn("concept_extraction_unparseable", { itemId })
    return { status: "failed", written: 0, rejected: 0, reason: "the model did not return JSON", failure: "content" }
  }

  let parsed
  try {
    parsed = parseExtraction(json, knownChunkIds)
  } catch (err) {
    logger.warn("concept_extraction_malformed", { itemId, message: err instanceof Error ? err.message : String(err) })
    return {
      status: "failed",
      written: 0,
      rejected: 0,
      reason: err instanceof Error ? err.message : "malformed",
      failure: "content",
    }
  }

  if (parsed.rejected.length > 0) {
    // Surfaced rather than swallowed: a run where most concepts fail
    // validation is a prompt problem, and quietly storing the survivors
    // would hide it indefinitely.
    logger.info("concept_extraction_partial", {
      itemId,
      accepted: parsed.concepts.length,
      rejected: parsed.rejected.length,
      firstReason: parsed.rejected[0]?.reason,
    })
  }

  const toWrite: (ExtractedConcept & { source: "llm" })[] = parsed.concepts.map((c) => ({ ...c, source: "llm" }))
  const { written } = await replaceItemConcepts(itemId, toWrite, scope)

  return { status: "extracted", written, rejected: parsed.rejected.length }
}

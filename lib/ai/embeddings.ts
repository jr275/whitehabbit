import "server-only"

/* ================================================================== *
 * EMBEDDINGS — shared platform, not a Knowledge detail.
 *
 * This lives in lib/ai rather than lib/knowledge because it is
 * infrastructure both products will want: Knowledge needs it now for
 * retrieval, and Workers will need it later for the same reason.
 * scripts/check-boundaries.mjs lists lib/ai as shared platform for
 * exactly that reason — Knowledge is allowed to import it, and is
 * NOT allowed to import lib/agent (Workforce's own LLM providers),
 * which is why this is a new abstraction rather than a reach across
 * the boundary or a copy of one.
 *
 * WHY THIS IS NOT THE EXISTING PROVIDER ABSTRACTION.
 * lib/agent/tools/llm-providers speaks generation: prompt in, text
 * out. Embedding is a different operation with a different contract
 * (and, on the provider that serves it here, a different endpoint).
 * Promoting the generation providers to shared platform is a real
 * move, but it belongs to the phase that needs generation from
 * Knowledge — doing it now would be a large refactor of Workforce
 * code for a feature that does not exist yet.
 *
 * DOCUMENT vs QUERY. Both go through the same model, but they are
 * separate calls on purpose: providers distinguish the two (a
 * passage being stored versus a question being asked), and the
 * asymmetry is real enough that collapsing them into one method
 * would make the difference unexpressible later.
 * ================================================================== */

export interface EmbeddingVector {
  values: number[]
  /** Which model produced this, recorded so a later re-index can be
   *  driven by a query instead of rebuilding the whole library. */
  model: string
  provider: string
}

export interface EmbeddingProvider {
  readonly id: string
  readonly model: string
  /** The width this provider is configured to return. Must match the
   *  vector column — see migrations/0008. */
  readonly dimensions: number
  isConfigured(): boolean
  embedDocument(input: string): Promise<EmbeddingVector>
  embedQuery(input: string): Promise<EmbeddingVector>
}

export class EmbeddingNotConfiguredError extends Error {}
export class EmbeddingUpstreamError extends Error {}

/** The stored width, fixed by migrations/0008's vector(768). Declared
 *  here as well so a provider that returns something else is caught
 *  before the database rejects the insert, with a message that says
 *  which side is wrong. */
export const EMBEDDING_DIMENSIONS = 768

/* ---- Gemini ------------------------------------------------------ */

/** Read at call time, not at module load. A module-level
 *  `process.env` read is a build-time constant in Next.js: it gets
 *  inlined into the bundle, so a deployment could not point this at a
 *  proxy without a rebuild, while the key and model beside it WOULD
 *  change — the inconsistency is the trap. Matches lib/ai/llm/
 *  gemini.ts's apiBase(). */
function geminiBase(): string {
  return (process.env.GEMINI_BASE_URL_PUBLIC || "https://generativelanguage.googleapis.com").replace(/\/$/, "")
}

/** Deliberately no default, matching lib/agent/tools/llm-providers/
 *  gemini.ts's existing convention in this repository: no model id
 *  can be confirmed current at the time this is written, so a missing
 *  variable is treated exactly like a missing credential rather than
 *  silently calling a model that may not exist. */
function geminiEmbeddingModel(): string | undefined {
  return process.env.GEMINI_EMBEDDING_MODEL || undefined
}

interface GeminiEmbedResponse {
  embedding?: { values?: number[] }
}

/** taskType tells Gemini whether it is embedding something to be
 *  stored or something being searched for. Asymmetric embeddings
 *  measurably improve retrieval, and the parameter is the only place
 *  the distinction can be expressed. */
type GeminiTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"

export function createGeminiEmbeddingProvider(fetchImpl: typeof fetch = fetch): EmbeddingProvider {
  async function embed(input: string, taskType: GeminiTask): Promise<EmbeddingVector> {
    const key = process.env.GEMINI_API_KEY
    const modelId = geminiEmbeddingModel()
    if (!key || !modelId) {
      throw new EmbeddingNotConfiguredError("Set GEMINI_API_KEY and GEMINI_EMBEDDING_MODEL to enable semantic search.")
    }
    if (input.trim().length === 0) throw new EmbeddingUpstreamError("Refusing to embed empty text.")

    let res: Response
    try {
      res = await fetchImpl(`${geminiBase()}/v1beta/models/${encodeURIComponent(modelId)}:embedContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: `models/${modelId}`,
          content: { parts: [{ text: input }] },
          taskType,
          // The stored width is ours to choose — the provider
          // truncates. Asking for exactly what the column holds is
          // what keeps the two in step.
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      // Network, DNS, timeout. Never leak the key or the URL.
      throw new EmbeddingUpstreamError(err instanceof Error ? `Embedding request failed: ${err.message}` : "Embedding request failed.")
    }

    if (!res.ok) {
      // Status only. A provider error body can echo the request, and
      // the request carries the text being embedded.
      throw new EmbeddingUpstreamError(`Embedding provider returned ${res.status}.`)
    }

    const json = (await res.json().catch(() => null)) as GeminiEmbedResponse | null
    const values = json?.embedding?.values
    if (!Array.isArray(values) || values.length === 0) {
      throw new EmbeddingUpstreamError("Embedding provider returned no vector.")
    }
    if (values.length !== EMBEDDING_DIMENSIONS) {
      // Caught here rather than at the INSERT, so the message names
      // the real problem instead of a column type mismatch.
      throw new EmbeddingUpstreamError(
        `Embedding provider returned ${values.length} dimensions; storage expects ${EMBEDDING_DIMENSIONS}.`,
      )
    }
    return { values, model: modelId, provider: "gemini" }
  }

  return {
    id: "gemini",
    /* A GETTER, not a snapshot, and the distinction is load-bearing.
     *
     * embed() reads geminiEmbeddingModel() fresh on every call, so a
     * captured value would drift the moment a provider outlived a
     * configuration change — reporting one model while calling
     * another. Today every call site builds a provider per request and
     * the two agree, which is exactly what makes this the kind of bug
     * a later refactor introduces silently: hoisting `const provider =
     * resolveEmbeddingProvider()` to module scope looks harmless.
     *
     * What it would cost: embedItemChunks passes this value to
     * chunksNeedingEmbedding, whose predicate is "no embedding row
     * with THIS model". A stale value matches nothing, so every pass
     * would re-embed every chunk — paying the provider again, in full,
     * each time, while the counts still looked plausible. */
    get model() {
      return geminiEmbeddingModel() ?? "(unset)"
    },
    dimensions: EMBEDDING_DIMENSIONS,
    isConfigured: () => Boolean(process.env.GEMINI_API_KEY && geminiEmbeddingModel()),
    embedDocument: (input) => embed(input, "RETRIEVAL_DOCUMENT"),
    embedQuery: (input) => embed(input, "RETRIEVAL_QUERY"),
  }
}

/** The provider the application uses. A single resolution point so
 *  adding a second provider later is a change here and nowhere in
 *  Knowledge's business logic. */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  return createGeminiEmbeddingProvider()
}

/* ---- Diagnostics ------------------------------------------------- *
 * Semantic search failing open to lexical is the right behaviour and
 * the dangerous one: a degraded system answers, so it looks healthy.
 * These types exist so "is semantic search actually on?" is a question
 * with an answer, at every layer, without anyone reading env vars or
 * inferring it from an empty result set.
 * ------------------------------------------------------------------ */

/** not_requested — the caller asked for lexical only; nothing is wrong
 *  provider_not_configured — no GEMINI_API_KEY / GEMINI_EMBEDDING_MODEL
 *  provider_error — configured, but the call failed (detail is logged
 *                   server-side; it never travels in this value) */
export type SemanticDisabledReason = "not_requested" | "provider_not_configured" | "provider_error"

export type SemanticSearchStatus =
  | { enabled: true }
  | { enabled: false; reason: SemanticDisabledReason }

/** Is semantic search available right now? Answerable without running
 *  a search, which is what makes it usable as a health check. Reports
 *  configuration only — a configured provider can still fail at call
 *  time, and that is reported per-search. */
export function describeSemanticSearch(provider: EmbeddingProvider = resolveEmbeddingProvider()): SemanticSearchStatus {
  return provider.isConfigured() ? { enabled: true } : { enabled: false, reason: "provider_not_configured" }
}

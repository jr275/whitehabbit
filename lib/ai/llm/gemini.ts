import "server-only"

/* ================================================================== *
 * GEMINI PROVIDER — a real call to the Google Generative Language API.
 *
 * Moved here from lib/agent/tools/llm-providers/ unchanged except for
 * the cost lookup, which stayed behind in Workforce (see anthropic.ts).
 *
 * Unlike Anthropic, GEMINI_MODEL has no built-in default: no model id
 * written here is confirmed current for this deployment, so one is
 * never assumed. A missing GEMINI_MODEL is treated exactly like a
 * missing credential — not configured, not a guess.
 * ================================================================== */

import type { LlmCallDeps, LlmCallInput, LlmProvider, LlmResult } from "./types"

const PROVIDER_ID = "gemini"

function apiBase(): string {
  return (process.env.GEMINI_BASE_URL_PUBLIC || "https://generativelanguage.googleapis.com").replace(/\/$/, "")
}

function model(): string | undefined {
  return process.env.GEMINI_MODEL || undefined
}

function isConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY && !!model()
}

function notConfiguredReason(): string {
  if (!process.env.GEMINI_API_KEY) return "Configure GEMINI_API_KEY for this deployment."
  return "Configure GEMINI_MODEL (a currently supported gemini-* model id) for this deployment."
}

interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string }
}

/** Never let a raw provider message reach a log or a UI unfiltered.
 *  Google's error bodies for this endpoint do not echo the key back;
 *  this is a defensive backstop against ever surfacing something that
 *  looks like one, plus a cap against runaway bodies. */
function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/AQ\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/AIzaSy[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 300)
}

/** Classify on the signals Google actually returns, never "every 403
 *  is a bad key". A 403 with PERMISSION_DENIED means the key
 *  authenticated fine and the project behind it is denied access
 *  (billing, verification, model access) — separately actionable from
 *  an invalid credential. */
type GeminiFailureKind = "invalid_credential" | "permission_denied" | "provider_error"

function classifyGeminiFailure(httpStatus: number, providerStatus: string | undefined, message: string): GeminiFailureKind {
  if (providerStatus === "PERMISSION_DENIED") return "permission_denied"
  if (httpStatus === 401 || providerStatus === "UNAUTHENTICATED" || /api key not valid/i.test(message)) return "invalid_credential"
  return "provider_error"
}

async function call(input: LlmCallInput, deps: LlmCallDeps = {}): Promise<LlmResult> {
  const started = Date.now()
  const fetchImpl = deps.fetchImpl ?? fetch
  const key = process.env.GEMINI_API_KEY
  const modelId = model()
  if (!key || !modelId) {
    return { ok: false, reason: "not_configured", message: notConfiguredReason(), durationMs: Date.now() - started }
  }

  try {
    const res = await fetchImpl(`${apiBase()}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: { maxOutputTokens: input.maxTokens ?? 2000 },
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as GeminiErrorBody | null
      const rawMessage = body?.error?.message ?? `HTTP ${res.status}`
      const providerStatus = body?.error?.status
      const sanitizedMessage = sanitizeProviderMessage(rawMessage)
      const kind = classifyGeminiFailure(res.status, providerStatus, rawMessage)
      const statusSuffix = providerStatus ? `, ${providerStatus}` : ""

      // permission_denied is real and distinct but is not a
      // credential-validity failure, so it maps to provider_error; the
      // message is what carries the distinction to whoever reads it.
      return {
        ok: false,
        reason: kind === "invalid_credential" ? "invalid_credential" : "provider_error",
        message:
          kind === "invalid_credential"
            ? `Gemini rejected the configured API key (${res.status}${statusSuffix}): ${sanitizedMessage}`
            : kind === "permission_denied"
              ? `Gemini denied this project access (${res.status}${statusSuffix}): ${sanitizedMessage}`
              : `Gemini API returned ${res.status}${statusSuffix}: ${sanitizedMessage}`,
        durationMs: Date.now() - started,
      }
    }

    const json = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      modelVersion?: string
    } | null
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    if (!text) {
      return {
        ok: false,
        reason: "provider_error",
        message: "Gemini returned a response with no text content.",
        durationMs: Date.now() - started,
      }
    }

    return {
      ok: true,
      output: {
        text,
        model: json?.modelVersion ?? modelId,
        inputTokens: json?.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json?.usageMetadata?.candidatesTokenCount ?? 0,
        provider: PROVIDER_ID,
      },
      durationMs: Date.now() - started,
    }
  } catch (err) {
    return {
      ok: false,
      reason: "provider_error",
      message: err instanceof Error ? err.message : "Gemini request failed",
      durationMs: Date.now() - started,
    }
  }
}

export const geminiProvider: LlmProvider = {
  id: PROVIDER_ID,
  displayName: "Gemini",
  isConfigured,
  notConfiguredReason,
  call,
}

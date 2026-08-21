import "server-only"

/* ================================================================== *
 * GEMINI PROVIDER — a real call to the Google Generative Language API.
 *
 * Unlike Anthropic, GEMINI_MODEL has no built-in default: no model id
 * here is confirmed current for this deployment, so one is never
 * assumed. Missing GEMINI_MODEL is treated exactly like a missing
 * credential — NOT_CONFIGURED, not a guess.
 * ================================================================== */

import { llmCostUsd } from "@/lib/agent/cost"
import type { ToolActionResult } from "@/lib/agent/types"
import type { LlmCallInput, LlmCallOutput, LlmProvider } from "./types"

const PROVIDER_ID = "gemini"
const API_BASE = (process.env.GEMINI_BASE_URL_PUBLIC || "https://generativelanguage.googleapis.com").replace(/\/$/, "")

function model(): string | undefined {
  return process.env.GEMINI_MODEL || undefined
}

function isConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY && !!model()
}

function notConfiguredReason(): string {
  if (!process.env.GEMINI_API_KEY) return "Configure GEMINI_API_KEY to run this worker."
  return "Configure GEMINI_MODEL (a currently supported gemini-* model id) to run this worker."
}

interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string }
}

async function call(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const started = Date.now()
  const key = process.env.GEMINI_API_KEY
  const modelId = model()
  if (!key || !modelId) {
    return { ok: false, blocked: true, blockedReason: notConfiguredReason(), durationMs: Date.now() - started }
  }

  try {
    const res = await fetch(`${API_BASE}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`, {
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
      const message = body?.error?.message ?? `HTTP ${res.status}`
      const status = body?.error?.status
      // Gemini reports a bad API key as 400 INVALID_ARGUMENT ("API key
      // not valid...") as often as a clean 401/403 — classify on the
      // real signals the API actually returns, not just the HTTP code.
      const invalidCredential =
        res.status === 401 ||
        res.status === 403 ||
        status === "PERMISSION_DENIED" ||
        status === "UNAUTHENTICATED" ||
        /api key not valid/i.test(message)
      return {
        ok: false,
        errorCode: invalidCredential ? "invalid_credential" : "provider_error",
        error: invalidCredential ? `Gemini rejected the configured API key (${res.status}).` : `Gemini API returned ${res.status}: ${message.slice(0, 300)}`,
        durationMs: Date.now() - started,
      }
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      modelVersion?: string
    }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    const inputTokens = json.usageMetadata?.promptTokenCount ?? 0
    const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0
    const cost = llmCostUsd(PROVIDER_ID, inputTokens, outputTokens)

    return {
      ok: true,
      data: { text, model: json.modelVersion ?? modelId, inputTokens, outputTokens, provider: PROVIDER_ID },
      durationMs: Date.now() - started,
      costUsd: cost.costUsd ?? undefined,
    }
  } catch (err) {
    return {
      ok: false,
      errorCode: "provider_error",
      error: err instanceof Error ? err.message : "Gemini request failed",
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

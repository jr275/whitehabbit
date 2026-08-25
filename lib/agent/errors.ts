/* ================================================================== *
 * NORMALIZED ERROR MODEL — section 26 of the connectivity platform
 * brief. A richer, connector-facing label ALONGSIDE the existing
 * ExecutionReasonCode ("missing_credential" | "invalid_credential" |
 * "provider_error" | "execution_error" — lib/agent/types.ts), used
 * for telemetry/observability display. Deliberately additive: nothing
 * about retry classification (lib/agent/retry.ts's
 * isTransientToolFailure, which already correctly branches on the
 * narrower ExecutionReasonCode set) is touched or reimplemented here.
 *
 * The original provider error string is kept as-is for server-side
 * debugging (never redacted here) — this module only ever adds a
 * normalized CODE next to it, never replaces the message.
 * ================================================================== */

export type NormalizedErrorCode =
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "TIMEOUT_ERROR"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PROVIDER_ERROR"
  | "UNKNOWN_ERROR"

export interface ErrorClassificationInput {
  /** The existing, narrower ExecutionReasonCode-shaped signal a
   * ToolActionResult already carries, if any. */
  errorCode?: "invalid_credential" | "provider_error" | "execution_error" | string
  /** A real HTTP status code, when the failure came from an HTTP call
   * and the connector adapter captured it (e.g. Salesforce's
   * SalesforceApiError, Slack's parsed response) — never guessed. */
  httpStatus?: number
  /** A real Retry-After hint in ms, when the provider sent one —
   * same field ToolActionResult.retryAfterMs already carries. */
  retryAfterMs?: number
  error?: string
}

/**
 * Deterministic, explainable mapping — real signals only (HTTP status,
 * an existing errorCode, a Retry-After hint, or a network-failure-
 * shaped message), never a guess. Order matters: a genuine 429/
 * Retry-After always wins over a generic status-based read, an exact
 * HTTP status always wins over the coarser existing errorCode.
 */
export function classifyNormalizedError(input: ErrorClassificationInput): NormalizedErrorCode {
  if (input.retryAfterMs != null || input.httpStatus === 429) return "RATE_LIMIT_ERROR"
  if (input.httpStatus === 401) return "AUTHENTICATION_ERROR"
  if (input.httpStatus === 403) return "AUTHORIZATION_ERROR"
  if (input.httpStatus === 404) return "NOT_FOUND"
  if (input.httpStatus === 409) return "CONFLICT"
  if (input.httpStatus === 408) return "TIMEOUT_ERROR"
  if (input.httpStatus != null && input.httpStatus >= 500) return "PROVIDER_ERROR"

  const message = (input.error ?? "").toLowerCase()
  if (/timeout|aborted|timed out/.test(message)) return "TIMEOUT_ERROR"
  if (/econnrefused|enotfound|network|fetch failed|dns/.test(message)) return "NETWORK_ERROR"

  if (input.errorCode === "invalid_credential") return "AUTHENTICATION_ERROR"
  if (input.errorCode === "execution_error") return "VALIDATION_ERROR"
  if (input.errorCode === "provider_error") return "PROVIDER_ERROR"

  return "UNKNOWN_ERROR"
}

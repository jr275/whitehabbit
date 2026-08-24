import "server-only"

/* ================================================================== *
 * STRUCTURED LOGGER — one JSON line per event, to stdout (Vercel
 * captures function stdout/stderr as structured log entries
 * automatically — no logging service integration needed for this to
 * be real production observability, not a placeholder).
 *
 * Never log: API keys, tokens, password hashes, full prompts where
 * inappropriate. Every call site here passes only identifiers and
 * short reason strings — see each call site's comment.
 * ================================================================== */

export interface LogContext {
  requestId?: string
  executionId?: string
  workerId?: string
  organizationId?: string
  userId?: string
  [key: string]: unknown
}

function emit(level: "info" | "warn" | "error", event: string, context: LogContext = {}) {
  const line = {
    level,
    event,
    time: new Date().toISOString(),
    ...context,
  }
  const text = JSON.stringify(line)
  if (level === "error") console.error(text)
  else if (level === "warn") console.warn(text)
  else console.log(text)
}

export const logger = {
  info: (event: string, context?: LogContext) => emit("info", event, context),
  warn: (event: string, context?: LogContext) => emit("warn", event, context),
  error: (event: string, context?: LogContext) => emit("error", event, context),
}

export function newRequestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

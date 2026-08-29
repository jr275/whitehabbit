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

/* FINDING LOG-01.
 *
 * Call sites are careful about what they pass, but one class of value
 * is not under their control: the `message` of an error they did not
 * construct. A pg connection failure carries the connection string,
 * an HTTP client error can carry an Authorization header, and
 * withApiHandler logs err.message verbatim for anything unhandled. The
 * response body is already scrubbed; the log line was not.
 *
 * Redaction is deliberately narrow — it targets the shapes secrets
 * actually take, so ordinary diagnostic text survives intact and the
 * logs stay useful. */
const SECRET_PATTERNS: [RegExp, string][] = [
  // postgres://user:password@host, https://user:token@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s@]+)@/gi, "$1$2:[redacted]@"],
  // password=..., pwd=..., secret=..., token=..., api_key=..., apikey=...
  [/\b(password|passwd|pwd|secret|token|api[_-]?key|auth)\s*[=:]\s*("?)([^\s"&,;]+)\2/gi, "$1=[redacted]"],
  // Authorization: Bearer xxx
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  // long opaque credentials: sk-..., ghp_..., xoxb-...
  [/\b(sk|pk|rk)-[A-Za-z0-9]{16,}/g, "$1-[redacted]"],
  [/\b(gh[pousr]|xox[baprs])[_-][A-Za-z0-9]{16,}/g, "$1_[redacted]"],
]

function redact(value: unknown): unknown {
  if (typeof value !== "string") return value
  let out = value
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement)
  return out
}

function emit(level: "info" | "warn" | "error", event: string, context: LogContext = {}) {
  const scrubbed: LogContext = {}
  for (const [key, value] of Object.entries(context)) scrubbed[key] = redact(value)

  const line = {
    level,
    event,
    time: new Date().toISOString(),
    ...scrubbed,
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

import "server-only"

/* ================================================================== *
 * RUNTIME MODE — a safe, non-secret indicator of which environment
 * this deployment actually is, and the one place LLM_DEV_MODE is
 * hard-blocked in production.
 *
 * VERCEL_ENV is set automatically by Vercel ("production" | "preview"
 * | "development") — not a secret, safe to reason about and to expose
 * a derived label from. Locally (no VERCEL_ENV) this falls back to
 * NODE_ENV.
 * ================================================================== */

export type RuntimeMode = "development" | "preview" | "production"

export function getRuntimeMode(): RuntimeMode {
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv === "production") return "production"
  if (vercelEnv === "preview") return "preview"
  if (vercelEnv === "development") return "development"
  return process.env.NODE_ENV === "production" ? "production" : "development"
}

export function isProduction(): boolean {
  return getRuntimeMode() === "production"
}

/** LLM_DEV_MODE=true routes every LLM call to a deterministic local
 * fixture — real for local/preview development, but it must never be
 * possible for a production deployment to silently serve simulated
 * results because an env var was left on by accident. This is the
 * one place that decides "is dev mode actually allowed right now" —
 * lib/agent/tools/llm.ts calls this, not process.env directly. */
export function isDevModeAllowed(): boolean {
  if (isProduction()) return false
  return (process.env.LLM_DEV_MODE || "").trim().toLowerCase() === "true"
}

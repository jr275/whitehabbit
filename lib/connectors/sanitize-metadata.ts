/* ================================================================== *
 * Shared, non-secret-only Connection.metadata sanitizer. Extracted out
 * of app/api/connections/route.ts (its original, only caller) so the
 * new PATCH /api/connections/[id] route (default-property selection
 * etc.) enforces the exact same rule rather than re-implementing it:
 * never trust a request body to hold a real credential, even for a
 * field an org explicitly asked to save (e.g. GA4's defaultPropertyId
 * — a property ID, never a token).
 *
 * Deliberately dependency-free (no "server-only", no lib/api-error) so
 * it stays directly unit-testable — lib/api-error.ts pulls in
 * next-auth/next/server transitively via lib/session.ts, which this
 * repo's whole test suite already avoids importing at all. Callers
 * (real API routes) catch MetadataValidationError and re-raise it as
 * api-error.ts's real ValidationError, which is what actually shapes
 * the HTTP response — this module just decides which keys are unsafe.
 * ================================================================== */

const METADATA_KEY_DENYLIST = /token|secret|password|api[_-]?key|credential/i

export class MetadataValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MetadataValidationError"
  }
}

export function sanitizeConnectionMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (METADATA_KEY_DENYLIST.test(key)) throw new MetadataValidationError(`"${key}" is not allowed in connection metadata.`)
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value
  }
  return result
}

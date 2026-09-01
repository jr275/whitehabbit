/* ================================================================== *
 * PLATFORM — the ONLY shared-code boundary available to the Knowledge
 * Library.
 *
 * Two products live in this repository:
 *
 *   Workforce / Studio   — existing, stable, must not be modified
 *   Knowledge Library    — new, additive
 *
 * Knowledge code may import from "@/lib/platform/*" and from
 * "@/lib/knowledge/*". It may not reach into Workforce internals, and
 * Workforce may not reach into Knowledge. See
 * docs/PHASE-5-IMPLEMENTATION-READINESS.md §4 and
 * scripts/check-boundaries.mjs, which fails CI on a violation.
 *
 * These are deliberately RE-EXPORTS, not moves. Relocating the
 * underlying modules would rewrite imports across ~14 Workforce files
 * for a cosmetic gain, and the Workforce is frozen. This directory is
 * therefore the shared contract: if something is not exported here,
 * Knowledge does not get to use it.
 *
 * PREFER THE FOCUSED MODULES over this barrel. `platform/errors`
 * imports `next/server`, so a module that pulls the barrel in gets a
 * Next.js runtime dependency it may not want — which matters for code
 * that has to run outside the Next request context (and for the test
 * runner). Import `@/lib/platform/security` in a fetcher, not `@/lib/
 * platform`.
 * ================================================================== */

export * from "./db.ts"
export * from "./session.ts"
export * from "./errors.ts"
export * from "./logger.ts"
export * from "./ratelimit.ts"
export * from "./security.ts"
export * from "./runtime.ts"
export * from "./utils.ts"

#!/usr/bin/env node
/* ================================================================== *
 * PRODUCT BOUNDARY CHECK
 *
 * Two products share this repository:
 *
 *   KNOWLEDGE   the canonical product — app/knowledge, components/
 *               knowledge, lib/knowledge, app/api/knowledge
 *   WORKFORCE   the older Agent/Studio product and everything it owns
 *
 * This script fails the build if either reaches into the other. It
 * exists because that mistake is easy, silent and expensive: someone
 * imports a Workforce type into Knowledge because it looked convenient,
 * and from then on Knowledge cannot be reasoned about, deployed or
 * extracted on its own.
 *
 * Deliberately a regex over import specifiers, not an AST walk. ESLint
 * is not a dependency of this project and adding one to enforce a
 * ten-line rule would be the wrong trade. This is enough to catch the
 * mistake it exists to catch.
 *
 *   node scripts/check-boundaries.mjs
 *
 * WHAT IT DOES NOT ENFORCE (yet). Knowledge currently imports shared
 * platform code directly — @/lib/session, @/lib/api-error,
 * @/lib/rate-limit, @/lib/db/*, @/lib/security/*. Those are legitimate
 * platform primitives, so they are allowed here. They are also, today,
 * how Workforce leaks into Knowledge's bundle: lib/db/repo.ts imports
 * @/lib/workforce/model, and Knowledge reaches it through recordAudit,
 * userBelongsToOrg and checkRateLimit. Fixing that means extracting
 * those three functions into real platform modules — a later commit.
 * When it lands, move the SHARED_PLATFORM entries below into
 * WORKFORCE_ONLY and this script enforces the tighter rule unchanged.
 * ================================================================== */

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

/** Only these trees are product code. Scoped explicitly so the check
 * never wanders into node_modules, .next, or build artefacts. */
const SOURCE_ROOTS = ["app", "components", "lib"]

/**
 * Workforce-owned modules. Knowledge must never import these — this is
 * the rule the check exists for.
 */
const WORKFORCE_ONLY = [
  "lib/agent",
  "lib/workforce",
  "lib/workforce-demo",
  "lib/worker",
  "lib/character",
  "lib/products",
  "lib/insights",
  "lib/library", // Workforce's worker library — unrelated to the Knowledge Library
  "lib/fabric-graph",
  "lib/simulation",
]

/**
 * Shared platform, allowed in both products for now. See the header:
 * this list is expected to shrink, not grow.
 *
 * RULE 4 makes this list load-bearing rather than documentation: a
 * module listed here may not import EITHER product. Until that rule
 * existed the list was only a comment, and a shared module was free to
 * import lib/agent — which would have put Workforce in Knowledge's
 * bundle through the shared import and defeated rules 1 and 3 without
 * tripping either. That is not hypothetical: promoting the LLM
 * providers into lib/ai/llm is exactly the change that would have done
 * it, since the providers they replaced imported lib/agent/cost.
 */
const SHARED_PLATFORM = [
  // Embeddings are infrastructure, not a Knowledge feature: Workers
  // will need the same abstraction. Knowledge may import it; lib/agent
  // (Workforce's generation providers) stays off-limits, which is why
  // this exists instead of a cross-boundary import.
  "lib/ai",
  "lib/db",
  "lib/session",
  "lib/api-error",
  "lib/rate-limit",
  "lib/security",
  "lib/observability",
  "lib/runtime-mode",
  "lib/auth",
  "lib/auth-features",
  // Which product a sign-in is heading into, read from the callbackUrl.
  // Shared because /login and /signup are shared: one route, one
  // session, three presentations.
  "lib/auth-context",
  "lib/auth-password",
  "lib/auth.config",
  "lib/utils",
]

/** Knowledge-owned trees. Workforce must not import these. */
const KNOWLEDGE_ONLY = ["lib/knowledge", "components/knowledge"]

/** Component trees Knowledge may use besides its own. */
const SHARED_COMPONENTS = ["components/ui", "components/auth"]

const SOURCE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx"])
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out // a source root that does not exist is not an error
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.has(path.extname(entry))) out.push(full)
  }
  return out
}

const IMPORT_RE = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g

/** Is the statement containing this specifier `import type` /
 * `export type`? Scans back to the nearest import/export keyword,
 * which is all that is needed because a specifier only ever appears at
 * the end of one such statement.
 *
 * Only RULE 4 cares. A type import is erased by the compiler and
 * reaches no bundle, so it cannot launder a product across the shared
 * layer — which is the only thing rule 4 forbids. Rules 1 and 3 stay
 * strict on purpose: they forbid the products from KNOWING about each
 * other, and a shared type is knowledge whether or not it ships. */
function isTypeOnly(src, index) {
  const before = src.slice(0, index)
  const start = Math.max(before.lastIndexOf("import"), before.lastIndexOf("export"))
  if (start === -1) return false
  return /^(?:import|export)\s+type\b/.test(before.slice(start))
}

function importsOf(file) {
  const src = readFileSync(file, "utf8")
  const specifiers = []
  let m
  while ((m = IMPORT_RE.exec(src)) !== null) {
    specifiers.push({ specifier: m[1], typeOnly: isTypeOnly(src, m.index) })
  }
  return specifiers
}

/** Resolve an import specifier to a repo-relative module path, or null
 * for a package import we do not care about. */
function toRepoPath(specifier, fromFile) {
  if (specifier.startsWith("@/")) return specifier.slice(2)
  if (specifier.startsWith(".")) {
    return path.relative(root, path.resolve(path.dirname(fromFile), specifier))
  }
  return null
}

const isKnowledgeFile = (rel) =>
  rel.startsWith("lib/knowledge/") ||
  rel.startsWith("components/knowledge/") ||
  rel.startsWith("app/knowledge/") ||
  rel.startsWith("app/api/knowledge/")

const isWorkforceFile = (rel) => !isKnowledgeFile(rel)

const startsWithAny = (value, prefixes) => prefixes.some((p) => value === p || value.startsWith(`${p}/`))

const violations = []

for (const sourceRoot of SOURCE_ROOTS) {
  for (const file of walk(path.join(root, sourceRoot))) {
    const rel = path.relative(root, file)

    for (const { specifier, typeOnly } of importsOf(file)) {
      const target = toRepoPath(specifier, file)
      if (!target) continue

      // RULE 1 — Knowledge must not import Workforce modules.
      if (isKnowledgeFile(rel) && startsWithAny(target, WORKFORCE_ONLY)) {
        violations.push(
          `${rel}\n    imports "${specifier}"\n    → Knowledge must not depend on Workforce. Knowledge is a standalone product.`,
        )
      }

      // RULE 2 — Knowledge may use its own components, plus shared ones.
      if (
        isKnowledgeFile(rel) &&
        target.startsWith("components/") &&
        !startsWithAny(target, [...KNOWLEDGE_ONLY, ...SHARED_COMPONENTS])
      ) {
        violations.push(
          `${rel}\n    imports "${specifier}"\n    → Knowledge may use components/knowledge, components/ui and components/auth only.`,
        )
      }

      // RULE 3 — Workforce must not depend on Knowledge either. A
      // one-way rule leaves the other direction free to rot.
      if (isWorkforceFile(rel) && startsWithAny(target, KNOWLEDGE_ONLY)) {
        violations.push(
          `${rel}\n    imports "${specifier}"\n    → Workforce must not depend on Knowledge.`,
        )
      }

      // RULE 4 — Shared platform depends on neither product. Both
      // products import these modules, so anything a shared module
      // pulls in lands in BOTH bundles. A platform module that reached
      // into a product would launder that product across the boundary
      // while rules 1 and 3 reported success.
      if (
        !typeOnly &&
        startsWithAny(rel, SHARED_PLATFORM) &&
        startsWithAny(target, [...WORKFORCE_ONLY, ...KNOWLEDGE_ONLY])
      ) {
        violations.push(
          `${rel}\n    imports "${specifier}"\n    → Shared platform must not depend on a product. Both products import ${rel}, so this would put "${specifier}" in both bundles.`,
        )
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} product-boundary violation(s):\n`)
  for (const v of violations) console.error(`  ${v}\n`)
  process.exit(1)
}

console.log(`✓ product boundaries hold (Knowledge ⇄ Workforce)`)
console.log(`  allowed shared platform: ${SHARED_PLATFORM.join(", ")}`)

#!/usr/bin/env node
/* ================================================================== *
 * BOUNDED CONTEXT BOUNDARY CHECK
 *
 * Two products share this repository. This script fails if either
 * reaches into the other. It is the enforcement mechanism specified in
 * docs/PHASE-5-IMPLEMENTATION-READINESS.md §4.
 *
 * ESLint is not a dependency of this project and Milestone 1 is
 * explicitly zero-new-dependencies, so this is a plain Node script
 * over the import statements. It is deliberately simple: a regex over
 * import/require/dynamic-import specifiers, not an AST walk. That is
 * enough to catch the mistake it exists to catch — someone importing
 * a Workforce module into Knowledge because a type looked convenient.
 *
 *   node scripts/check-boundaries.mjs
 * ================================================================== */

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

/** Workforce-owned modules. Knowledge must not import these. */
const WORKFORCE_ONLY = [
  "lib/workforce",
  "lib/workforce-demo",
  "lib/character",
  "lib/library", // the Workforce *worker* library — unrelated to the Knowledge Library
  "lib/products",
  "lib/insights",
  "lib/worker",
  "lib/agent",
  "lib/fabric-graph",
  "lib/simulation",
  "lib/db/repo",
  "lib/db/client",
  "lib/db/schema",
  "lib/session",
  "lib/api-error",
  "lib/rate-limit",
  "lib/observability",
  "lib/security",
  "lib/runtime-mode",
  "lib/auth",
]

/** Knowledge-owned trees. Workforce must not import these. */
const KNOWLEDGE_ONLY = ["lib/knowledge", "components/knowledge"]

/** Component trees Knowledge may use. */
const SHARED_COMPONENTS = ["components/ui"]

const SOURCE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx"])
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "docs", "public"])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.has(path.extname(entry))) out.push(full)
  }
  return out
}

const IMPORT_RE = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g

function importsOf(file) {
  const src = readFileSync(file, "utf8")
  const specifiers = []
  let m
  while ((m = IMPORT_RE.exec(src)) !== null) specifiers.push(m[1])
  return specifiers
}

/** Resolve a specifier to a repo-relative module path, or null. */
function toRepoPath(specifier, fromFile) {
  if (specifier.startsWith("@/")) return specifier.slice(2)
  if (specifier.startsWith(".")) {
    const abs = path.resolve(path.dirname(fromFile), specifier)
    return path.relative(root, abs)
  }
  return null // a package import
}

const isKnowledgeFile = (rel) =>
  rel.startsWith("lib/knowledge/") ||
  rel.startsWith("components/knowledge/") ||
  rel.startsWith("app/api/knowledge/") ||
  rel.startsWith("app/(knowledge)/")

const isWorkforceFile = (rel) =>
  !isKnowledgeFile(rel) &&
  !rel.startsWith("lib/platform/") &&
  !rel.startsWith("tests/") &&
  !rel.startsWith("scripts/") &&
  (rel.startsWith("lib/") || rel.startsWith("app/") || rel.startsWith("components/"))

const startsWithAny = (value, prefixes) => prefixes.some((p) => value === p || value.startsWith(`${p}/`))

const violations = []

for (const file of walk(root)) {
  const rel = path.relative(root, file)
  if (rel.startsWith("tests/") || rel.startsWith("scripts/")) continue

  for (const specifier of importsOf(file)) {
    const target = toRepoPath(specifier, file)
    if (!target) continue

    // RULE: Knowledge may reach shared code ONLY through lib/platform.
    if (isKnowledgeFile(rel) && startsWithAny(target, WORKFORCE_ONLY)) {
      violations.push(
        `${rel}\n    imports "${specifier}"\n    → Knowledge must reach shared code through "@/lib/platform" only.`,
      )
    }

    // RULE: Knowledge may not use Workforce components.
    if (
      isKnowledgeFile(rel) &&
      target.startsWith("components/") &&
      !startsWithAny(target, [...KNOWLEDGE_ONLY, ...SHARED_COMPONENTS])
    ) {
      violations.push(
        `${rel}\n    imports "${specifier}"\n    → Knowledge may use components/knowledge and components/ui only.`,
      )
    }

    // RULE: Workforce must not depend on Knowledge.
    if (isWorkforceFile(rel) && startsWithAny(target, KNOWLEDGE_ONLY)) {
      violations.push(`${rel}\n    imports "${specifier}"\n    → Workforce must not depend on the Knowledge Library.`)
    }

    // RULE: platform is a leaf — it must not depend on either product's domain.
    if (rel.startsWith("lib/platform/") && startsWithAny(target, KNOWLEDGE_ONLY)) {
      violations.push(`${rel}\n    imports "${specifier}"\n    → lib/platform must not depend on Knowledge.`)
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} bounded-context violation(s):\n`)
  for (const v of violations) console.error(`  ${v}\n`)
  process.exit(1)
}

console.log("✓ bounded-context boundaries hold")

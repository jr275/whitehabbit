/* ================================================================== *
 * MODULE RESOLUTION HOOKS
 *
 * Lets a plain Node process import application code exactly as
 * Next.js imports it. Two shims, both of which a bundler normally
 * provides and raw Node ESM does not:
 *
 *   1. the "@/..." path alias from tsconfig.json
 *   2. extensionless specifiers ("./client" -> "./client.ts")
 *
 * Zero dependencies — Node's built-in module resolve hooks only.
 * Combined with `node --experimental-strip-types`, this is the whole
 * reason the test suite needs no bundler, no transpiler and no test
 * framework: the application's real modules are imported as-is.
 *
 * Lives in scripts/ rather than tests/ because it is not test-specific
 * — anything that runs application code outside Next needs it, and two
 * copies of module resolution would drift.
 * ================================================================== */

import { statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = process.cwd()

/** Probe the extensions TypeScript would have resolved. */
function firstExistingFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ]
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

export async function resolve(specifier, context, next) {
  // 1. "@/lib/knowledge/url" -> <root>/lib/knowledge/url.ts
  if (specifier.startsWith("@/")) {
    const resolved = firstExistingFile(path.join(root, specifier.slice(2)))
    if (resolved) return next(pathToFileURL(resolved).href, context)
  }

  // 2. "./client" -> "./client.ts", relative to the importing file
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL))
    const resolved = firstExistingFile(path.resolve(parentDir, specifier))
    if (resolved) return next(pathToFileURL(resolved).href, context)
  }

  // 3. bare package subpaths without an extension ("next/headers").
  //    Bundlers resolve these; raw Node ESM does not.
  try {
    return await next(specifier, context)
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" && /^[^./]/.test(specifier) && !specifier.startsWith("node:")) {
      for (const ext of [".js", ".mjs", ".cjs"]) {
        try {
          return await next(`${specifier}${ext}`, context)
        } catch {
          /* try the next extension */
        }
      }
    }
    throw err
  }
}

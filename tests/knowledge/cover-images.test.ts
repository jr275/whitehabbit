/* ================================================================== *
 * COVER IMAGES — a source-level guard, honestly labelled.
 *
 * This asserts over the component SOURCE, not over a rendered DOM.
 * The repo has no component-rendering harness, and pulling one in to
 * check a single JSX attribute would cost far more than it protects.
 * What it protects is worth protecting anyway: crossOrigin on a cover
 * is invisible in review, invisible in a typecheck, and its failure
 * mode is every cover image quietly disappearing behind an onError
 * fallback that looks deliberate.
 *
 * Why crossOrigin is wrong here, measured in a real Chromium against
 * two local origins:
 *
 *   host WITHOUT cors headers, no crossOrigin    → loaded
 *   host WITHOUT cors headers, crossOrigin=anon  → ERROR
 *   host WITH    cors headers, no crossOrigin    → loaded
 *   host WITH    cors headers, crossOrigin=anon  → loaded
 *
 * Only the combination the Reader used fails, and it is the common
 * one: crossOrigin="anonymous" makes the browser send a CORS request
 * and discard any response without Access-Control-Allow-Origin, which
 * most publisher image CDNs do not send. The single thing CORS mode
 * buys — readable pixels for a canvas — is not used anywhere in this
 * codebase.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const COMPONENT_DIR = "components/knowledge"
const files = readdirSync(COMPONENT_DIR).filter((f) => f.endsWith(".tsx"))

describe("knowledge components — remote images", () => {
  it("finds the components it is supposed to be guarding", () => {
    // A directory rename would otherwise turn this suite into a silent
    // no-op that keeps passing while guarding nothing.
    assert.ok(files.length > 0, `no .tsx files under ${COMPONENT_DIR}`)
    assert.ok(files.includes("reader-view.tsx"), "reader-view.tsx is the file this regression lived in")
  })

  for (const file of files) {
    const source = readFileSync(join(COMPONENT_DIR, file), "utf8")

    it(`${file} sets no crossOrigin`, () => {
      assert.doesNotMatch(
        source,
        /crossOrigin/,
        "CORS mode on a cover buys nothing here and drops every image from a host without Access-Control-Allow-Origin",
      )
    })

    it(`${file} gives every remote <img> a no-referrer policy`, () => {
      // The cover URL comes from a third-party page, so the request
      // goes to a third-party host. Sending the app URL as Referer
      // leaks where the user is reading and trips hotlink protection
      // on some CDNs. Every image in this directory already did this
      // except the three Reader covers.
      const tags = source.match(/<img\b[\s\S]*?\/>/g) ?? []
      for (const tag of tags) {
        if (!/src=\{/.test(tag)) continue // a local asset path, not remote
        assert.match(tag, /referrerPolicy="no-referrer"/, `an <img> in ${file} lacks referrerPolicy:\n${tag}`)
      }
    })
  }
})

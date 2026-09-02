/* ================================================================== *
 * SECURITY HEADERS — regression tests for lib/knowledge/security-
 * headers.ts (Commit 8: CSP + security headers, Knowledge only).
 *
 * These assert against the real, exported header-building functions —
 * the same ones next.config.mjs calls — not a re-implementation, and
 * not a rendered response (this repo has no HTTP-integration test
 * harness; the real header set was verified against a real running
 * server with curl and against real rendered pages with a real
 * Chromium — see the commit message for that evidence). What belongs
 * here is regression protection: the shape of the policy should not
 * silently drift back toward `*`, lose a directive, or leak
 * 'unsafe-eval' into production, without a test failing.
 *
 * Commit 7 (Reader crossOrigin) has its own dedicated regression guard
 * already — tests/knowledge/cover-images.test.ts — untouched by this
 * commit and still exercised by this same `npm test` run, so it is not
 * duplicated here.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  buildKnowledgeCsp,
  knowledgeSecurityHeaders,
  YOUTUBE_EMBED_ORIGIN,
  VIMEO_EMBED_ORIGIN,
} from "@/lib/knowledge/security-headers"

const prodCsp = buildKnowledgeCsp(true)
const devCsp = buildKnowledgeCsp(false)
const readerSource = readFileSync("components/knowledge/reader-view.tsx", "utf8")

describe("Knowledge CSP — required directives present", () => {
  it("Content-Security-Policy header is present", () => {
    const headers = knowledgeSecurityHeaders(true)
    const csp = headers.find((h) => h.key === "Content-Security-Policy")
    assert.ok(csp, "no Content-Security-Policy header in knowledgeSecurityHeaders()")
    assert.equal(csp!.value, prodCsp)
  })

  it("default-src 'self' is set", () => {
    assert.match(prodCsp, /(^|; )default-src 'self'(;|$)/)
  })

  it("object-src 'none' is set", () => {
    assert.match(prodCsp, /(^|; )object-src 'none'(;|$)/)
  })

  it("base-uri 'self' is set", () => {
    assert.match(prodCsp, /(^|; )base-uri 'self'(;|$)/)
  })

  it("frame-ancestors is defined", () => {
    assert.match(prodCsp, /(^|; )frame-ancestors [^;]+/)
  })
})

describe("Knowledge CSP — YouTube and Vimeo, explicitly and only", () => {
  it("YouTube's embed origin is explicitly allowed in frame-src", () => {
    assert.match(prodCsp, /frame-src [^;]*https:\/\/www\.youtube\.com/)
  })

  it("the allowed YouTube origin is the exact one reader-view.tsx's videoEmbed() actually emits", () => {
    // Ties the CSP constant to the real embed-URL source, not just to
    // itself — a future edit that changes the embed host without
    // updating the CSP (or vice versa) fails this, not silently drifts.
    assert.match(readerSource, /`https:\/\/www\.youtube\.com\/embed\//)
    assert.ok(readerSource.includes(YOUTUBE_EMBED_ORIGIN), "YOUTUBE_EMBED_ORIGIN no longer matches reader-view.tsx's own embed host")
  })

  it("Vimeo's embed origin is explicitly allowed in frame-src", () => {
    assert.match(prodCsp, /frame-src [^;]*https:\/\/player\.vimeo\.com/)
  })

  it("the allowed Vimeo origin is the exact one reader-view.tsx's videoEmbed() actually emits", () => {
    assert.match(readerSource, /`https:\/\/player\.vimeo\.com\/video\//)
    assert.ok(readerSource.includes(VIMEO_EMBED_ORIGIN), "VIMEO_EMBED_ORIGIN no longer matches reader-view.tsx's own embed host")
  })

  it("does NOT allow youtube-nocookie.com — reader-view.tsx never emits it, so the CSP must not pretend it does", () => {
    assert.doesNotMatch(prodCsp, /youtube-nocookie/)
  })

  it("does NOT allow bare vimeo.com as a frame-src (only player.vimeo.com is ever used as an iframe src)", () => {
    assert.doesNotMatch(prodCsp, /frame-src [^;]*https:\/\/vimeo\.com/)
  })
})

describe("Knowledge CSP — never a wildcard", () => {
  it("no frame-src *", () => {
    assert.doesNotMatch(prodCsp, /frame-src[^;]*(^|\s)\*(\s|;|$)/)
  })

  it("no img-src *", () => {
    assert.doesNotMatch(prodCsp, /img-src[^;]*(^|\s)\*(\s|;|$)/)
  })

  it("no script-src *", () => {
    assert.doesNotMatch(prodCsp, /script-src[^;]*(^|\s)\*(\s|;|$)/)
  })

  it("no default-src *", () => {
    assert.doesNotMatch(prodCsp, /default-src[^;]*(^|\s)\*(\s|;|$)/)
  })
})

describe("Knowledge CSP — 'unsafe-eval' only where justified (development), never in production", () => {
  it("production script-src has no 'unsafe-eval'", () => {
    const scriptSrc = prodCsp.match(/script-src ([^;]+)/)?.[1] ?? ""
    assert.doesNotMatch(scriptSrc, /'unsafe-eval'/)
  })

  it("development script-src DOES carry 'unsafe-eval' — proven necessary (React's own dev-mode eval(), see the header comment in lib/knowledge/security-headers.ts), not a blanket default", () => {
    const scriptSrc = devCsp.match(/script-src ([^;]+)/)?.[1] ?? ""
    assert.match(scriptSrc, /'unsafe-eval'/)
  })

  it("every other directive is byte-identical between development and production — 'unsafe-eval' is the only environment-conditional source", () => {
    const stripEval = (csp: string) => csp.replace(/ 'unsafe-eval'/, "")
    assert.equal(stripEval(devCsp), prodCsp)
  })
})

describe("Knowledge — the other required security headers", () => {
  const prod = knowledgeSecurityHeaders(true)
  const byKey = (key: string) => prod.find((h) => h.key === key)

  it("X-Content-Type-Options: nosniff", () => {
    assert.equal(byKey("X-Content-Type-Options")?.value, "nosniff")
  })

  it("Referrer-Policy is set", () => {
    assert.ok(byKey("Referrer-Policy")?.value)
  })

  it("Permissions-Policy is set and denies power features Knowledge never uses, without denying what the YouTube/Vimeo <iframe> needs", () => {
    const value = byKey("Permissions-Policy")?.value ?? ""
    assert.ok(value.length > 0, "no Permissions-Policy header")
    for (const denied of ["camera=()", "microphone=()", "geolocation=()"]) {
      assert.ok(value.includes(denied), `Permissions-Policy should deny ${denied}`)
    }
    // The <iframe>'s own `allow` attribute (reader-view.tsx) grants these
    // — Permissions-Policy must never override that by denying them too.
    for (const mustStayOpen of ["fullscreen", "autoplay", "picture-in-picture", "encrypted-media"]) {
      assert.ok(!value.includes(`${mustStayOpen}=()`), `Permissions-Policy must not deny ${mustStayOpen} — the video embed needs it`)
    }
  })

  it("X-Frame-Options: SAMEORIGIN, matching frame-ancestors 'self'", () => {
    assert.equal(byKey("X-Frame-Options")?.value, "SAMEORIGIN")
  })
})

describe("Strict-Transport-Security — production only, never against a local origin", () => {
  it("present in production", () => {
    const headers = knowledgeSecurityHeaders(true)
    assert.ok(headers.some((h) => h.key === "Strict-Transport-Security"))
  })

  it("absent in development — a local `next dev` origin is plain HTTP, and HSTS has no correct meaning there", () => {
    const headers = knowledgeSecurityHeaders(false)
    assert.ok(!headers.some((h) => h.key === "Strict-Transport-Security"))
  })
})

/* Extraction and sanitization. Saved pages are attacker-controlled,
 * so the sanitizer suite is a security test, not a formatting test. */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  extractContent,
  ExtractionError,
  EXTRACTION_LADDER,
  LOCAL_LADDER,
  type ContentExtractor,
} from "@/lib/knowledge/ingestion/extraction/index"
import { htmlToText, sanitizeHtml } from "@/lib/knowledge/ingestion/extraction/sanitize"

const ARTICLE = `<!doctype html>
<html lang="en-GB">
<head>
  <title>Why Retrieval Systems Fail | Example Engineering</title>
  <meta property="og:site_name" content="Example Engineering">
  <meta property="og:title" content="Why Retrieval Systems Fail">
  <meta property="og:description" content="Three failure patterns that recur.">
  <meta property="og:image" content="/cover.png">
  <meta name="author" content="Sarah Chen">
  <meta property="article:published_time" content="2026-03-14T09:00:00Z">
  <link rel="icon" href="/fav.ico">
</head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a><a href="/jobs">Jobs</a></nav>
  <header><h1>Example Engineering</h1></header>
  <article>
    <h1>Why Retrieval Systems Fail</h1>
    <p>Most retrieval failures are chunking failures rather than model failures, and the distinction matters because the two have completely different fixes that teams routinely confuse.</p>
    <p>The first pattern is chunk boundaries that split an argument in half, so neither chunk carries the whole claim and neither retrieves well for the obvious query.</p>
    <p>The second pattern is an embedding model mismatched to the domain, which is invisible in evaluation and obvious in production once real queries arrive.</p>
  </article>
  <aside class="sidebar"><a href="/x">Related</a><a href="/y">More</a></aside>
  <footer><p>Copyright Example</p></footer>
</body></html>`

const PAYWALL_STUB = `<html><head><title>Paywalled</title>
  <meta property="og:description" content="Subscribe to continue reading."></head>
  <body><div class="paywall"><p>Subscribe.</p></div></body></html>`

describe("extractContent", () => {
  // Pinned to the in-process tiers: these cases are about the
  // heuristics, not about whether a sidecar happens to be running.
  const local = { ladder: LOCAL_LADDER }

  it("extracts the article body and drops page chrome", async () => {
    const r = await extractContent({ url: "https://example.com/why-retrieval-fails", html: ARTICLE }, local)
    assert.equal(r.method, "readability")
    assert.equal(r.extractorVersion, "readability@1")
    assert.match(r.contentText, /chunking failures/)
    assert.match(r.contentText, /embedding model mismatched/)
    assert.doesNotMatch(r.contentText, /Jobs|Copyright Example/, "nav and footer must not survive")
  })

  it("extracts metadata with the documented precedence", async () => {
    const r = await extractContent({ url: "https://example.com/a", html: ARTICLE }, local)
    assert.equal(r.title, "Why Retrieval Systems Fail") // og:title, site suffix stripped
    assert.deepEqual(r.authors, ["Sarah Chen"])
    assert.equal(r.siteName, "Example Engineering")
    assert.equal(r.language, "en-gb")
    assert.equal(r.excerpt, "Three failure patterns that recur.")
    assert.equal(r.imageUrl, "https://example.com/cover.png") // resolved against the page
    assert.equal(r.faviconUrl, "https://example.com/fav.ico")
    assert.equal(r.publishedAt, Date.parse("2026-03-14T09:00:00Z"))
  })

  it("falls back to metadata-only rather than returning an empty article", async () => {
    const r = await extractContent({ url: "https://example.com/p", html: PAYWALL_STUB }, local)
    assert.equal(r.method, "metadata")
    assert.equal(r.contentHtml, null)
    assert.equal(r.title, "Paywalled")
    assert.equal(r.excerpt, "Subscribe to continue reading.")
  })

  it("throws when there is genuinely nothing to read", async () => {
    await assert.rejects(
      () => extractContent({ url: "https://example.com/x", html: "<html><body></body></html>" }, local),
      ExtractionError,
    )
    await assert.rejects(() => extractContent({ url: "https://example.com/x", html: "" }, local), ExtractionError)
  })

  it("rejects implausible publication dates rather than storing them", async () => {
    const bad = ARTICLE.replace("2026-03-14T09:00:00Z", "1000-01-01T00:00:00Z")
    const r = await extractContent({ url: "https://example.com/a", html: bad }, local)
    assert.equal(r.publishedAt, null)
  })

  it("records the SOURCE/DERIVED split on every result", async () => {
    const r = await extractContent({ url: "https://example.com/a", html: ARTICLE }, local)
    // DERIVED fields are always present, never guessed at by callers.
    assert.equal(typeof r.method, "string")
    assert.equal(typeof r.extractorVersion, "string")
    assert.equal(r.siteConfigMatched, false) // no per-domain rules in the local tiers
    assert.ok(r.confidence > 0 && r.confidence <= 1, `confidence out of range: ${r.confidence}`)
    // SOURCE fields the local tiers now read.
    assert.deepEqual(r.images, [])
    assert.equal(r.canonicalUrl, null)
  })

  it("reads the publisher's canonical URL separately from the fetched URL", async () => {
    const html = ARTICLE.replace(
      "<link rel=\"icon\"",
      '<link rel="canonical" href="https://example.com/canonical-path"><link rel="icon"',
    )
    const r = await extractContent({ url: "https://example.com/?utm_source=x", html }, local)
    assert.equal(r.canonicalUrl, "https://example.com/canonical-path")
  })
})

describe("extraction ladder", () => {
  /** A tier that always declines, to prove the ladder keeps going. */
  function decliningTier(id: "graby" | "readability", code: "extraction_empty" | "extractor_unavailable"): ContentExtractor {
    return {
      id,
      async isAvailable() {
        return true
      },
      async extract(): Promise<never> {
        throw new ExtractionError(code, "nope")
      },
    }
  }

  it("puts graby first and the in-process tiers last", () => {
    assert.deepEqual(
      EXTRACTION_LADDER.map((t) => t.id),
      ["graby", "readability", "metadata"],
      "ladder order is the extraction policy; changing it is a deliberate act",
    )
    // The last tier must be in-process, or a sidecar outage becomes an
    // ingestion outage.
    assert.equal(EXTRACTION_LADDER[EXTRACTION_LADDER.length - 1]?.id, "metadata")
  })

  it("falls through a declining tier and reports why", async () => {
    const seen: string[] = []
    const r = await extractContent(
      { url: "https://example.com/a", html: ARTICLE },
      {
        ladder: [decliningTier("graby", "extractor_unavailable"), ...LOCAL_LADDER],
        onFallthrough: (method, reason) => seen.push(`${method}:${reason}`),
      },
    )
    assert.deepEqual(seen, ["graby:extractor_unavailable"])
    assert.equal(r.method, "readability")
  })

  it("skips a tier that reports itself unavailable without calling it", async () => {
    let called = false
    const dead: ContentExtractor = {
      id: "graby",
      async isAvailable() {
        return false
      },
      async extract(): Promise<never> {
        called = true
        throw new ExtractionError("extraction_error", "must not run")
      },
    }
    const r = await extractContent({ url: "https://example.com/a", html: ARTICLE }, { ladder: [dead, ...LOCAL_LADDER] })
    assert.equal(called, false)
    assert.equal(r.method, "readability")
  })

  it("contains a tier that throws something that is not an ExtractionError", async () => {
    const rogue: ContentExtractor = {
      id: "graby",
      async isAvailable() {
        return true
      },
      async extract(): Promise<never> {
        throw new TypeError("undefined is not a function")
      },
    }
    const r = await extractContent({ url: "https://example.com/a", html: ARTICLE }, { ladder: [rogue, ...LOCAL_LADDER] })
    assert.equal(r.method, "readability", "one broken tier must not cost us the rest of the ladder")
  })

  it("throws the last tier's error when every tier declines", async () => {
    await assert.rejects(
      () =>
        extractContent(
          { url: "https://example.com/a", html: ARTICLE },
          { ladder: [decliningTier("graby", "extraction_empty"), decliningTier("readability", "extraction_empty")] },
        ),
      ExtractionError,
    )
  })

  it("sanitizes whatever a tier returns, however hostile", async () => {
    const hostile: ContentExtractor = {
      id: "graby",
      async isAvailable() {
        return true
      },
      async extract() {
        // A compromised or simply buggy sidecar. The ladder sanitizes
        // centrally so no tier can be trusted to have done it.
        return {
          title: "t",
          contentHtml: `<p>real text that is long enough to survive</p><script>alert(1)</script><img src=x onerror=alert(1)>`,
          contentText: "real text that is long enough to survive",
          excerpt: null,
          authors: [],
          publishedAt: null,
          language: null,
          siteName: null,
          canonicalUrl: null,
          imageUrl: null,
          faviconUrl: null,
          images: [],
          method: "graby" as const,
          extractorVersion: "graby@test",
          siteConfigMatched: true,
          confidence: 0.9,
        }
      },
    }
    const r = await extractContent({ url: "https://example.com/a", html: ARTICLE }, { ladder: [hostile] })
    assert.ok(r.contentHtml)
    assert.doesNotMatch(r.contentHtml, /<script/i)
    assert.doesNotMatch(r.contentHtml, /onerror/i)
    assert.match(r.contentText, /real text/)
  })

  it("pins a single method when asked", async () => {
    const r = await extractContent({ url: "https://example.com/a", html: ARTICLE }, { only: "metadata" })
    assert.equal(r.method, "metadata")
    assert.equal(r.contentHtml, null, "pinning tier 3 must not silently promote to tier 2")
  })
})

describe("sanitizeHtml", () => {
  const XSS_CORPUS: [string, string][] = [
    ["script tag", `<p>ok</p><script>alert(1)</script>`],
    ["img onerror", `<img src=x onerror="alert(1)">`],
    ["svg script", `<svg><script>alert(1)</script></svg>`],
    ["iframe srcdoc", `<iframe srcdoc="<script>alert(1)</script>"></iframe>`],
    ["javascript href", `<a href="javascript:alert(1)">click</a>`],
    ["JaVaScRiPt href", `<a href="JaVaScRiPt:alert(1)">click</a>`],
    ["javascript with entities", `<a href="java&#115;cript:alert(1)">click</a>`],
    ["data uri html", `<a href="data:text/html,<script>alert(1)</script>">x</a>`],
    ["data uri img", `<img src="data:text/html,<script>alert(1)</script>">`],
    ["body onload", `<body onload="alert(1)"><p>hi</p></body>`],
    ["style expression", `<div style="width:expression(alert(1))">x</div>`],
    ["form action", `<form action="https://evil.test"><input name="a"></form>`],
    ["object embed", `<object data="evil.swf"></object><embed src="evil.swf">`],
    ["onmouseover", `<p onmouseover="alert(1)">hover</p>`],
    ["meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.test">`],
    ["base tag", `<base href="https://evil.test/">`],
    ["comment payload", `<!--<script>alert(1)</script>-->`],
    ["vbscript", `<a href="vbscript:msgbox(1)">x</a>`],
  ]

  for (const [name, payload] of XSS_CORPUS) {
    it(`neutralizes: ${name}`, () => {
      const clean = sanitizeHtml(payload)
      assert.doesNotMatch(clean, /<script/i, `script survived in ${name}`)
      assert.doesNotMatch(clean, /\son[a-z]+\s*=/i, `event handler survived in ${name}`)
      assert.doesNotMatch(clean, /javascript:/i, `javascript: survived in ${name}`)
      assert.doesNotMatch(clean, /vbscript:/i, `vbscript: survived in ${name}`)
      assert.doesNotMatch(clean, /<iframe|<object|<embed|<form|<input|<base|<meta|<svg/i, `dangerous tag survived in ${name}`)
      assert.doesNotMatch(clean, /expression\s*\(/i, `css expression survived in ${name}`)
    })
  }

  it("keeps legitimate article markup", () => {
    const clean = sanitizeHtml(
      `<h2>Heading</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p>
       <ul><li>one</li><li>two</li></ul>
       <blockquote><p>quoted</p></blockquote>
       <a href="https://example.com/x">link</a>
       <img src="https://example.com/i.png" alt="pic">`,
    )
    assert.match(clean, /<h2>Heading<\/h2>/)
    assert.match(clean, /<strong>bold<\/strong>/)
    assert.match(clean, /<li>one<\/li>/)
    assert.match(clean, /<blockquote>/)
    assert.match(clean, /href="https:\/\/example\.com\/x"/)
    assert.match(clean, /alt="pic"/)
  })

  it("hardens outbound links and images", () => {
    const clean = sanitizeHtml(`<a href="https://example.com/x">l</a><img src="https://example.com/i.png">`)
    assert.match(clean, /rel="noopener noreferrer nofollow"/)
    assert.match(clean, /referrerpolicy="no-referrer"/, "images must not leak the reader to the publisher")
    assert.match(clean, /loading="lazy"/)
  })

  it("unwraps unknown tags instead of losing their text", () => {
    const clean = sanitizeHtml(`<custom-element><p>kept</p></custom-element>`)
    assert.match(clean, /kept/)
    assert.doesNotMatch(clean, /custom-element/)
  })
})

describe("htmlToText", () => {
  it("produces readable text with paragraph breaks and decoded entities", () => {
    const text = htmlToText(`<p>First para.</p><p>Second &amp; third &#8212; done.</p>`)
    assert.match(text, /First para\./)
    assert.match(text, /Second & third — done\./)
    assert.match(text, /\n\n/)
  })

  it("never leaks script contents into text", () => {
    assert.doesNotMatch(htmlToText(`<p>ok</p><script>var secret=1</script>`), /secret/)
  })
})

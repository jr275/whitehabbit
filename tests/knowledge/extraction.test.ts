/* Extraction and sanitization. Saved pages are attacker-controlled,
 * so the sanitizer suite is a security test, not a formatting test. */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { extractContent, ExtractionError } from "@/lib/knowledge/ingestion/extraction/index"
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

describe("extractContent", () => {
  it("extracts the article body and drops page chrome", () => {
    const r = extractContent({ url: "https://example.com/why-retrieval-fails", html: ARTICLE })
    assert.equal(r.extractor, "readability@1")
    assert.match(r.contentText, /chunking failures/)
    assert.match(r.contentText, /embedding model mismatched/)
    assert.doesNotMatch(r.contentText, /Jobs|Copyright Example/, "nav and footer must not survive")
  })

  it("extracts metadata with the documented precedence", () => {
    const r = extractContent({ url: "https://example.com/a", html: ARTICLE })
    assert.equal(r.title, "Why Retrieval Systems Fail") // og:title, site suffix stripped
    assert.deepEqual(r.authors, ["Sarah Chen"])
    assert.equal(r.siteName, "Example Engineering")
    assert.equal(r.language, "en-gb")
    assert.equal(r.excerpt, "Three failure patterns that recur.")
    assert.equal(r.imageUrl, "https://example.com/cover.png") // resolved against the page
    assert.equal(r.faviconUrl, "https://example.com/fav.ico")
    assert.equal(r.publishedAt, Date.parse("2026-03-14T09:00:00Z"))
  })

  it("falls back to metadata-only rather than returning an empty article", () => {
    // A paywall stub: real metadata, no readable body.
    const stub = `<html><head><title>Paywalled</title>
      <meta property="og:description" content="Subscribe to continue reading."></head>
      <body><div class="paywall"><p>Subscribe.</p></div></body></html>`
    const r = extractContent({ url: "https://example.com/p", html: stub })
    assert.equal(r.extractor, "metadata@1")
    assert.equal(r.contentHtml, null)
    assert.equal(r.title, "Paywalled")
    assert.equal(r.excerpt, "Subscribe to continue reading.")
  })

  it("throws when there is genuinely nothing to read", () => {
    assert.throws(() => extractContent({ url: "https://example.com/x", html: "<html><body></body></html>" }), ExtractionError)
    assert.throws(() => extractContent({ url: "https://example.com/x", html: "" }), ExtractionError)
  })

  it("rejects implausible publication dates rather than storing them", () => {
    const bad = ARTICLE.replace("2026-03-14T09:00:00Z", "1000-01-01T00:00:00Z")
    assert.equal(extractContent({ url: "https://example.com/a", html: bad }).publishedAt, null)
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

import { describe, expect, it } from "vitest"
import { extractArticle, sanitizeArticleHtml, segmentArticle } from "@/lib/pocket2/ingest/extract"

/* ================================================================== *
 * The reader stores HTML written by strangers and renders it inside a
 * signed-in session. These are the tests that stand between that and
 * stored XSS, so they are written adversarially rather than
 * illustratively.
 * ================================================================== */

const hasNoScriptable = (html: string) => {
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toMatch(/javascript:/i)
  expect(html).not.toMatch(/\son\w+\s*=/i)   // onerror=, onload=, onclick=…
  expect(html).not.toMatch(/<iframe|<object|<embed|<form/i)
}

describe("sanitizeArticleHtml — script execution", () => {
  it.each([
    ["inline script", "<p>ok</p><script>alert(1)</script>"],
    ["event handler", `<img src="x" onerror="alert(1)">`],
    ["body onload", `<div onload="alert(1)">text</div>`],
    ["javascript: href", `<a href="javascript:alert(1)">click</a>`],
    ["JaVaScRiPt: mixed case", `<a href="JaVaScRiPt:alert(1)">click</a>`],
    ["javascript with entities", `<a href="java&#115;cript:alert(1)">click</a>`],
    ["data: URI script", `<a href="data:text/html,<script>alert(1)</script>">x</a>`],
    ["svg onload", `<svg onload="alert(1)"><circle /></svg>`],
    ["iframe", `<iframe src="https://evil.test"></iframe>`],
    ["object", `<object data="evil.swf"></object>`],
    ["embed", `<embed src="evil.swf">`],
    ["form + input", `<form action="https://evil.test"><input name="pw"></form>`],
    ["meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.test">`],
    ["base tag", `<base href="https://evil.test/">`],
    ["style with expression", `<div style="width:expression(alert(1))">x</div>`],
    ["style url javascript", `<div style="background:url(javascript:alert(1))">x</div>`],
    ["srcdoc", `<iframe srcdoc="<script>alert(1)</script>"></iframe>`],
    ["nested encoded", `<p><a href="&#106;avascript&colon;alert(1)">x</a></p>`],
  ])("neutralizes %s", (_label, payload) => {
    hasNoScriptable(sanitizeArticleHtml(payload))
  })

  it("removes script CONTENT, not just the tag", () => {
    // Stripping the tag but keeping its text would leave the source
    // visible in the article body.
    const out = sanitizeArticleHtml("<p>before</p><script>var secret = 1</script><p>after</p>")
    expect(out).not.toContain("var secret")
    expect(out).toContain("before")
    expect(out).toContain("after")
  })

  it("drops inline style entirely — the Reader owns its typography", () => {
    const out = sanitizeArticleHtml(`<p style="position:fixed;top:0;z-index:9999">overlay</p>`)
    expect(out).not.toMatch(/style=/i)
    expect(out).toContain("overlay")
  })

  it("refuses data: and protocol-relative image sources", () => {
    const out = sanitizeArticleHtml(
      `<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="><img src="//evil.test/x.png">`,
    )
    expect(out).not.toContain("data:")
    expect(out).not.toContain("//evil.test")
  })
})

describe("sanitizeArticleHtml — what it must PRESERVE", () => {
  it("keeps the structure a real article is made of", () => {
    const out = sanitizeArticleHtml(`
      <h2>Heading</h2>
      <p>A <strong>bold</strong> and <em>italic</em> paragraph with a <a href="https://example.com/x">link</a>.</p>
      <ul><li>one</li><li>two</li></ul>
      <blockquote>Quoted.</blockquote>
      <figure><img src="https://example.com/i.png" alt="Alt"><figcaption>Caption</figcaption></figure>
      <pre><code>const x = 1</code></pre>
      <table><tr><th scope="col">H</th><td>C</td></tr></table>
    `)
    for (const fragment of ["<h2>", "<strong>", "<em>", "<ul>", "<li>", "<blockquote>",
                            "<figure>", "<figcaption>", "<pre>", "<code>", "<table>",
                            'alt="Alt"', 'scope="col"']) {
      expect(out, fragment).toContain(fragment)
    }
  })

  it("hardens outbound links rather than removing them", () => {
    const out = sanitizeArticleHtml(`<a href="https://example.com/a">source</a>`)
    expect(out).toContain('href="https://example.com/a"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain("noopener")
    expect(out).toContain("noreferrer")
    expect(out).toContain("nofollow")
  })

  it("survives malformed markup without throwing", () => {
    for (const broken of ["<p>unclosed", "<<<>>>", "<p><div></p></div>", "", "<!-- only a comment -->",
                          "<p>" + "a".repeat(100_000) + "</p>"]) {
      expect(() => sanitizeArticleHtml(broken)).not.toThrow()
    }
  })
})

describe("segmentArticle", () => {
  it("produces ordered, addressable segments — the read/listen seam", () => {
    const { segments, text } = segmentArticle(
      "<h2>Title</h2><p>First paragraph.</p><ul><li>Point</li></ul><blockquote>Quote.</blockquote>",
    )
    expect(segments.map((s) => s.kind)).toEqual(["heading", "paragraph", "list_item", "quote"])
    expect(segments.map((s) => s.ordinal)).toEqual([0, 1, 2, 3])
    expect(text).toContain("First paragraph.")
  })

  it("gives every segment a character range that matches its text", () => {
    const { segments } = segmentArticle("<p>alpha</p><p>beta</p>")
    for (const s of segments) expect(s.charEnd - s.charStart).toBe(s.text.length)
    expect(segments[1].charStart).toBeGreaterThan(segments[0].charEnd)
  })

  it("ignores empty and whitespace-only blocks", () => {
    const { segments } = segmentArticle("<p></p><p>   </p><p>real</p>")
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe("real")
  })
})

describe("extractArticle — never claims success it did not have", () => {
  const page = (body: string) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>`
  const longProse = "<p>" + "This is a real sentence of article prose. ".repeat(40) + "</p>"

  it("extracts a genuine article", () => {
    const result = extractArticle(page(`<article><h1>Real title</h1>${longProse}</article>`), "https://example.com/a")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.wordCount).toBeGreaterThan(150)
      expect(result.segments.length).toBeGreaterThan(0)
      expect(result.status).toBe("ok")
    }
  })

  it("reports a paywall as a paywall instead of storing the teaser", () => {
    const result = extractArticle(
      page(`<article><h1>X</h1><p>Subscribe to continue reading this article.</p>${longProse}</article>`),
      "https://example.com/a",
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("paywalled")
  })

  it("reports a sign-in wall as login_required", () => {
    const result = extractArticle(
      page(`<article><p>Sign in to continue reading.</p>${longProse}</article>`),
      "https://example.com/a",
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("login_required")
  })

  it("refuses a navigation-only page rather than calling it an article", () => {
    const result = extractArticle(page(`<nav><a href="/a">A</a><a href="/b">B</a></nav>`), "https://example.com/")
    expect(result.ok).toBe(false)
  })

  it("sanitizes what it extracts — extraction is not a bypass", () => {
    const result = extractArticle(
      page(`<article><h1>T</h1>${longProse}<script>alert(1)</script><img src=x onerror=alert(1)></article>`),
      "https://example.com/a",
    )
    expect(result.ok).toBe(true)
    if (result.ok) hasNoScriptable(result.html)
  })

  it("does not throw on hostile or empty input", () => {
    for (const input of ["", "<html>", "not html at all", "\0\0\0", "<p>" + "x".repeat(200_000) + "</p>"]) {
      expect(() => extractArticle(input, "https://example.com/")).not.toThrow()
    }
  })
})

/* ================================================================== *
 * ADDED DURING THE PHASE 2 SECURITY CHECKPOINT.
 *
 * Payload classes not covered by the first pass: MathML, SVG animation,
 * DOM clobbering, srcset, encoded and nested schemes, and the
 * relative-URL handling that a security review found was missing.
 * ================================================================== */

const LIVE_MARKUP = /<(script|iframe|object|embed|form|svg|math|style|link|meta|base)\b/i

describe("sanitizeArticleHtml — payloads beyond the obvious", () => {
  it.each([
    ["MathML wrapping a style block", `<math><mtext><style><img src=x onerror=alert(1)></style></mtext></math>`],
    ["MathML annotation-xml", `<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>`],
    ["MathML maction xlink", `<math><maction xlink:href="javascript:alert(1)">x</maction></math>`],
    ["SVG animate on href", `<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>`],
    ["SVG foreignObject iframe", `<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>`],
    ["SVG set onload", `<svg><set attributeName="onload" to="alert(1)"/></svg>`],
    ["marquee onstart", `<marquee onstart=alert(1)>x</marquee>`],
    ["details ontoggle", `<details ontoggle=alert(1) open>x</details>`],
    ["autofocus onfocus", `<input autofocus onfocus=alert(1)>`],
    ["video source onerror", `<video><source onerror="alert(1)"></video>`],
    ["button formaction", `<button formaction="javascript:alert(1)">x</button>`],
    ["link stylesheet", `<link rel="stylesheet" href="javascript:alert(1)">`],
    ["style @import", `<style>@import url("javascript:alert(1)")</style><p>x</p>`],
    ["body background", `<body background="javascript:alert(1)">`],
    ["table background", `<table background="javascript:alert(1)"><tr><td>x</td></tr></table>`],
    ["noscript escape", `<noscript><p title="</noscript><img src=x onerror=alert(1)>">x</p></noscript>`],
    ["template", `<template><img src=x onerror=alert(1)></template>`],
    ["custom element via is=", `<p is="evil-element">x</p>`],
  ])("neutralizes %s", (_label, payload) => {
    const out = sanitizeArticleHtml(payload)
    expect(out).not.toMatch(LIVE_MARKUP)
    expect(out).not.toMatch(/\son\w+\s*=/i)
    expect(out).not.toMatch(/javascript\s*:/i)
  })

  it.each([
    ["tab inside the scheme", `<a href="java\tscript:alert(1)">x</a>`],
    ["newline inside the scheme", `<a href="java\nscript:alert(1)">x</a>`],
    ["null byte inside the scheme", `<a href="java\0script:alert(1)">x</a>`],
    ["leading whitespace", `<a href="  javascript:alert(1)">x</a>`],
    ["hex entities", `<a href="&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)">x</a>`],
    ["decimal entities", `<a href="&#106;avascript:alert(1)">x</a>`],
    ["vbscript", `<a href="vbscript:msgbox(1)">x</a>`],
  ])("strips an href using %s", (_label, payload) => {
    const out = sanitizeArticleHtml(payload)
    expect(out).not.toMatch(/href="[^"]*(javascript|vbscript)/i)
  })

  it("drops a javascript: URL hidden in srcset", () => {
    for (const payload of [
      `<img srcset="javascript:alert(1) 1x" src="https://a.test/b.png">`,
      `<picture><source srcset="javascript:alert(1) 2x"><img src="https://a.test/b.png"></picture>`,
    ]) {
      expect(sanitizeArticleHtml(payload)).not.toMatch(/javascript/i)
    }
  })

  it("resists DOM clobbering of names the app might read", () => {
    // An attribute like name="body" or id="getElementById" can shadow a
    // real DOM property for scripts running on the page.
    const out = sanitizeArticleHtml(
      `<img name="body" src="https://a.test/x.png"><div id="attributes">x</div><a id="getElementById" href="https://a.test/">y</a><form id="config"><input name="isAdmin" value="1"></form>`,
    )
    expect(out).not.toMatch(/\sname=/i)
    expect(out).not.toMatch(/\sid=/i)
    expect(out).not.toMatch(/<form|<input/i)
  })

  it("removes tracking attributes that are not needed to read an article", () => {
    expect(sanitizeArticleHtml(`<a href="https://a.test/" ping="https://evil.test/track">x</a>`))
      .not.toMatch(/ping=/i)
  })
})

describe("target=_blank never yields an exploitable window.opener", () => {
  it("always emits rel=noopener alongside target=_blank", () => {
    const out = sanitizeArticleHtml(`<a href="https://a.test/">x</a>`)
    expect(out).toContain('target="_blank"')
    expect(out).toMatch(/rel="[^"]*noopener/)
  })

  it("cannot be defeated by the publisher supplying its own rel", () => {
    // rel="opener" explicitly re-enables window.opener; ours must win.
    for (const attrs of [`rel="opener"`, `rel="noreferrer"`, `rel=""`, `rel="opener noopener"`, `REL="opener"`]) {
      const out = sanitizeArticleHtml(`<a href="https://a.test/" ${attrs}>x</a>`)
      expect(out, attrs).toMatch(/rel="[^"]*noopener/)
      expect(out, attrs).not.toMatch(/rel="[^"]*\bopener\b(?![^"]*noopener)/)
    }
  })

  it("cannot be defeated by the publisher supplying its own target", () => {
    for (const attrs of [`target="_self"`, `target="_top"`, `target="myframe"`, `TARGET="_parent"`]) {
      expect(sanitizeArticleHtml(`<a href="https://a.test/" ${attrs}>x</a>`), attrs).toContain('target="_blank"')
    }
  })
})

describe("relative URLs are resolved against the source page", () => {
  const PAGE_URL = "https://publisher.test/posts/story"

  it("absolutizes links and images so they point at the publisher", () => {
    const out = sanitizeArticleHtml(
      `<p><a href="/local/page">l</a><a href="../up">u</a></p><p><img src="/img/a.png"><img src="b.png"></p>`,
      PAGE_URL,
    )
    expect(out).toContain('href="https://publisher.test/local/page"')
    expect(out).toContain('href="https://publisher.test/up"')
    expect(out).toContain('src="https://publisher.test/img/a.png"')
    expect(out).toContain('src="https://publisher.test/posts/b.png"')
  })

  it("leaves absolute URLs alone", () => {
    const out = sanitizeArticleHtml(`<a href="https://other.test/x">o</a><img src="https://cdn.test/i.png">`, PAGE_URL)
    expect(out).toContain('href="https://other.test/x"')
    expect(out).toContain('src="https://cdn.test/i.png"')
  })

  it("absolutizes every candidate in a srcset", () => {
    const out = sanitizeArticleHtml(`<img src="/a.png" srcset="/a.png 1x, /a@2x.png 2x">`, PAGE_URL)
    expect(out).toContain("https://publisher.test/a.png 1x")
    expect(out).toContain("https://publisher.test/a@2x.png 2x")
  })

  it("drops rather than resolves a non-http scheme", () => {
    const out = sanitizeArticleHtml(`<a href="javascript:alert(1)">x</a><img src="data:image/svg+xml,x">`, PAGE_URL)
    expect(out).not.toMatch(/javascript|data:/i)
  })

  it("does not leave a relative URL that would resolve against Pocket2's own origin", () => {
    // This is the actual risk: an unresolved "/admin/thing" becomes a
    // credentialed same-origin request from the reader's browser.
    const out = sanitizeArticleHtml(`<img src="/admin/thing"><a href="/settings">s</a>`, PAGE_URL)
    expect(out).not.toMatch(/(src|href)="\//)
  })

  it("still functions when no page URL is available", () => {
    expect(() => sanitizeArticleHtml(`<a href="/x">x</a>`)).not.toThrow()
  })
})

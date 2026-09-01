/* URL canonicalization — the basis of duplicate detection. */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { canonicalizeUrl, InvalidUrlError } from "@/lib/knowledge/ingestion/url"

describe("canonicalizeUrl", () => {
  it("collapses tracking-parameter variants of the same article to ONE hash", () => {
    // The scenario the product must get right: the same article
    // arriving from a newsletter, a social post and a search result.
    const variants = [
      "https://example.com/article",
      "https://example.com/article/",
      "https://example.com/article?utm_source=newsletter",
      "https://example.com/article?utm_source=x&utm_medium=social&utm_campaign=launch",
      "https://example.com/article?fbclid=abc123",
      "https://example.com/article?gclid=xyz",
      "https://example.com/article?ref=hackernews",
      "https://example.com/article#section-2",
      "https://EXAMPLE.com/article",
      "https://www.example.com/article",
      "https://example.com:443/article",
      "https://example.com//article",
    ]
    const hashes = new Set(variants.map((v) => canonicalizeUrl(v).urlHash))
    assert.equal(hashes.size, 1, `expected one identity, got ${hashes.size}: ${[...hashes].join(", ")}`)
  })

  it("keeps genuinely different URLs distinct", () => {
    const distinct = [
      "https://example.com/article",
      "https://example.com/other",
      "https://example.com/article?page=2", // content-bearing, not tracking
      "https://example.com/article?id=7",
      "http://example.com/article", // scheme is part of identity
      "https://other.com/article",
    ]
    const hashes = new Set(distinct.map((v) => canonicalizeUrl(v).urlHash))
    assert.equal(hashes.size, distinct.length, "these must not be merged")
  })

  it("sorts query parameters so order does not change identity", () => {
    const a = canonicalizeUrl("https://example.com/s?b=2&a=1")
    const b = canonicalizeUrl("https://example.com/s?a=1&b=2")
    assert.equal(a.urlHash, b.urlHash)
  })

  it("preserves hash routing, which is path-bearing", () => {
    const plain = canonicalizeUrl("https://example.com/app")
    const routed = canonicalizeUrl("https://example.com/app#/inbox/42")
    assert.notEqual(plain.urlHash, routed.urlHash)
    assert.ok(routed.canonicalUrl.endsWith("#/inbox/42"))
  })

  it("preserves the submitted URL verbatim", () => {
    const raw = "https://www.example.com/article/?utm_source=x#frag"
    assert.equal(canonicalizeUrl(raw).submittedUrl, raw)
  })

  it("strips www from the domain", () => {
    assert.equal(canonicalizeUrl("https://www.example.com/a").domain, "example.com")
    assert.equal(canonicalizeUrl("https://news.example.com/a").domain, "news.example.com")
  })

  it("rejects input that is not a saveable web URL", () => {
    const rejected = [
      "",
      "   ",
      "not a url",
      "ftp://example.com/file",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      `https://example.com/${"a".repeat(2100)}`,
    ]
    for (const input of rejected) {
      assert.throws(() => canonicalizeUrl(input), InvalidUrlError, `should reject: ${input.slice(0, 40)}`)
    }
  })

  it("produces a stable sha256 hex hash", () => {
    const { urlHash } = canonicalizeUrl("https://example.com/article")
    assert.match(urlHash, /^[0-9a-f]{64}$/)
    assert.equal(urlHash, canonicalizeUrl("https://example.com/article").urlHash)
  })
})

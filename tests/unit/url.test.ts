import { describe, expect, it } from "vitest"
import { canonicalizeUrl, InvalidUrlError, readingTimeSeconds, titleFromUrl } from "@/lib/pocket2/domain/url"

/* Canonicalization is what makes "save" idempotent, so these cases are
 * the specification of that behaviour, not incidental coverage. */

describe("canonicalizeUrl — identity", () => {
  const sameAs = (a: string, b: string) =>
    expect(canonicalizeUrl(a).hash, `${a}\n  should equal\n${b}`).toBe(canonicalizeUrl(b).hash)

  it("treats http/https, case and www as the same document", () => {
    sameAs("https://WWW.Example.com/Article", "https://example.com/Article")
    sameAs("https://example.com/article", "https://example.com/article/")
    sameAs("https://example.com:443/article", "https://example.com/article")
  })

  it("ignores tracking parameters", () => {
    sameAs("https://example.com/a?utm_source=news&utm_campaign=x", "https://example.com/a")
    sameAs("https://example.com/a?fbclid=abc123", "https://example.com/a")
    sameAs("https://example.com/a?gclid=1&mc_cid=2&igshid=3", "https://example.com/a")
  })

  it("ignores query parameter order but keeps meaningful parameters", () => {
    sameAs("https://example.com/s?b=2&a=1", "https://example.com/s?a=1&b=2")
    expect(canonicalizeUrl("https://example.com/s?page=2").hash)
      .not.toBe(canonicalizeUrl("https://example.com/s").hash)
  })

  it("ignores the fragment, which names a position rather than a document", () => {
    sameAs("https://example.com/a#section-3", "https://example.com/a")
  })

  it("keeps genuinely different documents distinct", () => {
    expect(canonicalizeUrl("https://example.com/a").hash).not.toBe(canonicalizeUrl("https://example.com/b").hash)
    expect(canonicalizeUrl("https://a.com/x").hash).not.toBe(canonicalizeUrl("https://b.com/x").hash)
    // path case is significant on most servers; host case is not
    expect(canonicalizeUrl("https://example.com/A").hash).not.toBe(canonicalizeUrl("https://example.com/a").hash)
  })

  it("preserves a subdomain that is not bare www", () => {
    expect(canonicalizeUrl("https://blog.example.com/p").domain).toBe("blog.example.com")
    expect(canonicalizeUrl("https://www.eu.example.com/p").domain).toBe("eu.example.com")
  })

  it("preserves the original input for 'open original'", () => {
    const result = canonicalizeUrl("  https://www.example.com/a?utm_source=x#frag  ")
    expect(result.original).toBe("https://www.example.com/a?utm_source=x#frag")
    expect(result.canonical).toBe("https://example.com/a")
  })

  it("accepts a pasted URL with no scheme", () => {
    expect(canonicalizeUrl("example.com/article").canonical).toBe("https://example.com/article")
  })

  it("strips embedded credentials rather than storing them", () => {
    expect(canonicalizeUrl("https://user:pw@example.com/a").canonical).toBe("https://example.com/a")
  })
})

describe("canonicalizeUrl — rejection", () => {
  /* These are the entry-point half of the URL-safety story. Whether a
   * well-formed URL is safe to FETCH is a separate question answered
   * by the SSRF guard at fetch time. */
  it.each([
    ["javascript:alert(1)", "javascript"],
    ["data:text/html,<script>alert(1)</script>", "data"],
    ["file:///etc/passwd", "file"],
    ["ftp://example.com/x", "ftp"],
  ])("rejects %s", (input) => {
    expect(() => canonicalizeUrl(input)).toThrow(InvalidUrlError)
  })

  it("rejects empty and hostless input", () => {
    expect(() => canonicalizeUrl("   ")).toThrow(InvalidUrlError)
    expect(() => canonicalizeUrl("https://")).toThrow(InvalidUrlError)
    expect(() => canonicalizeUrl("not a url at all")).toThrow(InvalidUrlError)
  })

  it("rejects a dotless host, which is a typo or an internal name", () => {
    expect(() => canonicalizeUrl("http://localhost:3000/x")).toThrow(InvalidUrlError)
    expect(() => canonicalizeUrl("http://intranet/x")).toThrow(InvalidUrlError)
  })

  it("explains the problem in language a user can act on", () => {
    expect(() => canonicalizeUrl("javascript:alert(1)")).toThrow(/only http and https/i)
  })
})

describe("derived display values", () => {
  it("derives a readable placeholder title from the URL", () => {
    expect(titleFromUrl("https://example.com/how-to-build-things.html")).toBe("How to build things")
    expect(titleFromUrl("https://example.com")).toBe("example.com")
  })

  it("computes reading time only from a real word count, with a sane floor", () => {
    expect(readingTimeSeconds(225)).toBe(60)
    expect(readingTimeSeconds(2250)).toBe(600)
    expect(readingTimeSeconds(5)).toBe(60)
  })
})

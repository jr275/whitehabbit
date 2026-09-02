/* ================================================================== *
 * CHARACTERIZATION — lib/knowledge/url.ts
 *
 * These tests DESCRIBE the canonicalizer as it behaves today. They are
 * a safety net, not a specification: they exist so that when the
 * canonicalizer is changed, every behaviour that changes does so
 * visibly and on purpose.
 *
 * Nothing here is a bug fix. Where the current behaviour looks wrong,
 * the test still asserts the CURRENT value and is marked with a
 * SUSPECT comment naming what is wrong and what it costs. Changing any
 * of those is a later, deliberate commit — and these tests are what
 * will prove the change did what it claimed.
 *
 * The canonical URL is a DEDUP KEY, not a display value: the exact URL
 * the user submitted is stored separately in knowledge_items.url. So
 * "is this correct?" always means "does this make the right things
 * equal and the wrong things distinct?", never "is this pretty?".
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { canonicalizeUrl, canonicalizeUrlSafe } from "@/lib/knowledge/url"

/** Two inputs the product should treat as the same saved page. */
function assertSame(a: string, b: string, why: string): void {
  assert.equal(canonicalizeUrl(a), canonicalizeUrl(b), why)
}

/** Two inputs the product must keep as separate saved pages. */
function assertDistinct(a: string, b: string, why: string): void {
  assert.notEqual(canonicalizeUrl(a), canonicalizeUrl(b), why)
}

describe("canonicalizeUrl — host", () => {
  it("drops a leading www.", () => {
    assert.equal(canonicalizeUrl("https://www.example.com/a"), "https://example.com/a")
    assertSame("https://www.example.com/a", "https://example.com/a", "www is not identity")
  })

  it("only drops www. at the start of the host", () => {
    assert.equal(canonicalizeUrl("https://www2.example.com/a"), "https://www2.example.com/a")
    assert.equal(canonicalizeUrl("https://api.www.example.com/a"), "https://api.www.example.com/a")
  })

  it("lowercases the host but never the path", () => {
    assert.equal(canonicalizeUrl("https://WWW.Example.COM/a"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/Article"), "https://example.com/Article")
    assertDistinct("https://example.com/Article", "https://example.com/article", "paths are case-sensitive")
  })

  it("normalises an IDN host to punycode", () => {
    assert.equal(canonicalizeUrl("https://café.example.com/a"), "https://xn--caf-dma.example.com/a")
    assertSame("https://café.example.com/a", "https://xn--caf-dma.example.com/a", "same host, two spellings")
  })

  it("drops the default port and keeps a custom one", () => {
    assert.equal(canonicalizeUrl("https://example.com:443/a"), "https://example.com/a")
    assert.equal(canonicalizeUrl("http://example.com:80/a"), "http://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com:8443/a"), "https://example.com:8443/a")
  })
})

describe("canonicalizeUrl — scheme", () => {
  it("assumes https when the user omits a scheme", () => {
    assert.equal(canonicalizeUrl("example.com/a"), "https://example.com/a")
  })

  it("keeps http and https as DIFFERENT keys", () => {
    assert.equal(canonicalizeUrl("http://example.com/a"), "http://example.com/a")
    assertDistinct(
      "http://example.com/a",
      "https://example.com/a",
      "the same page over http and https currently saves twice",
    )
    // SUSPECT (low): most sites redirect http→https, so the same
    // article pasted from an old link saves as a second item. Fixing
    // it means deciding whether the scheme is part of identity.
  })
})

describe("canonicalizeUrl — path", () => {
  it("collapses a trailing slash but preserves the root", () => {
    assert.equal(canonicalizeUrl("https://example.com/a/"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a///"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/"), "https://example.com/")
    assert.equal(canonicalizeUrl("https://example.com"), "https://example.com/")
    assertSame("https://example.com", "https://example.com/", "bare host and root are one page")
  })

  it("resolves dot segments", () => {
    assert.equal(canonicalizeUrl("https://example.com/a/./b/../c"), "https://example.com/a/c")
  })

  it("keeps a doubled slash inside the path", () => {
    assert.equal(canonicalizeUrl("https://example.com//a"), "https://example.com//a")
    assertDistinct("https://example.com//a", "https://example.com/a", "// is a different path today")
  })
})

describe("canonicalizeUrl — query", () => {
  it("removes exact-match tracking parameters", () => {
    for (const key of ["gclid", "fbclid", "msclkid", "igshid", "mc_cid", "mkt_tok", "ref_src", "spm"]) {
      assert.equal(canonicalizeUrl(`https://example.com/a?${key}=x`), "https://example.com/a", `${key} survived`)
    }
  })

  it("removes whole tracking families by prefix", () => {
    assert.equal(canonicalizeUrl("https://example.com/a?utm_source=x&utm_medium=y"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a?_ga=1&_gac=2"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a?pk_campaign=x&piwik_kwd=y"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a?ga_source=x"), "https://example.com/a")
  })

  it("matches tracking parameters case-insensitively", () => {
    assert.equal(canonicalizeUrl("https://example.com/a?UTM_SOURCE=x"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a?GCLID=x"), "https://example.com/a")
  })

  it("strips many tracking parameters at once", () => {
    assert.equal(
      canonicalizeUrl("https://example.com/a?utm_source=x&utm_medium=y&gclid=z&fbclid=w&mc_eid=v"),
      "https://example.com/a",
    )
    assertSame(
      "https://example.com/a?utm_source=newsletter&gclid=abc",
      "https://example.com/a",
      "the same article shared through two campaigns is one save",
    )
  })

  it("never removes a meaningful parameter", () => {
    assert.equal(canonicalizeUrl("https://example.com/a?utm_source=x&id=42"), "https://example.com/a?id=42")
    assert.equal(canonicalizeUrl("https://www.youtube.com/watch?v=abc123"), "https://youtube.com/watch?v=abc123")
    assertDistinct(
      "https://www.youtube.com/watch?v=aaa",
      "https://www.youtube.com/watch?v=bbb",
      "two videos must never collapse into one",
    )
    assertDistinct("https://example.com/a?page=1", "https://example.com/a?page=2", "pagination is identity")
  })

  it("sorts parameters so order is not identity", () => {
    assert.equal(canonicalizeUrl("https://example.com/a?b=2&a=1"), "https://example.com/a?a=1&b=2")
    assertSame("https://example.com/a?b=2&a=1", "https://example.com/a?a=1&b=2", "param order is not identity")
  })

  it("sorts repeated keys by value", () => {
    assert.equal(canonicalizeUrl("https://example.com/a?t=2&t=1"), "https://example.com/a?t=1&t=2")
    assertSame("https://example.com/a?t=2&t=1", "https://example.com/a?t=1&t=2", "repeat order is not identity")
  })

  it("keeps an empty-valued parameter", () => {
    assert.equal(canonicalizeUrl("https://example.com/a?q="), "https://example.com/a?q=")
  })
})

describe("canonicalizeUrl — fragments", () => {
  it("drops an ordinary fragment, which is right", () => {
    assert.equal(canonicalizeUrl("https://example.com/a#section"), "https://example.com/a")
    assertSame("https://example.com/a#intro", "https://example.com/a#outro", "an anchor is the same document")
  })

  it("ALSO drops #! and #/ routes, which collapses distinct pages", () => {
    // SUSPECT (high) — the highest-impact defect in this module.
    //
    // In a hash-routed SPA the fragment IS the document. Dropping it
    // makes every article on such a site canonicalise to the app
    // shell, so the FIRST one saved wins and every later one is
    // reported to the user as "Already in your library" and silently
    // opens the wrong article.
    //
    // Asserted as-is on purpose. A fix belongs in its own commit,
    // and these two assertions are what will prove it landed.
    assert.equal(canonicalizeUrl("https://example.com/app#!/artigo/1"), "https://example.com/app")
    assert.equal(canonicalizeUrl("https://example.com/app#!/artigo/2"), "https://example.com/app")
    assert.equal(
      canonicalizeUrl("https://example.com/app#!/artigo/1"),
      canonicalizeUrl("https://example.com/app#!/artigo/2"),
      "CURRENT BEHAVIOUR: two different hashbang articles collapse into one",
    )

    assert.equal(canonicalizeUrl("https://example.com/app#/artigo/1"), "https://example.com/app")
    assert.equal(
      canonicalizeUrl("https://example.com/app#/artigo/1"),
      canonicalizeUrl("https://example.com/app#/artigo/2"),
      "CURRENT BEHAVIOUR: two different hash-route articles collapse into one",
    )
  })
})

describe("canonicalizeUrl — encoding", () => {
  it("percent-encodes a literal space and leaves an encoded one alone", () => {
    assert.equal(canonicalizeUrl("https://example.com/a b"), "https://example.com/a%20b")
    assert.equal(canonicalizeUrl("https://example.com/a%20b"), "https://example.com/a%20b")
    assertSame("https://example.com/a b", "https://example.com/a%20b", "encoding is not identity")
  })

  it("percent-encodes non-ASCII in the path", () => {
    assert.equal(canonicalizeUrl("https://example.com/café"), "https://example.com/caf%C3%A9")
  })

  it("normalises %20 and + in the query to the same thing", () => {
    // Consequence of URLSearchParams round-tripping. Good for dedup;
    // it does mean a literal "+" and a space are conflated in a value.
    assert.equal(canonicalizeUrl("https://example.com/a?q=hello%20world"), "https://example.com/a?q=hello+world")
    assert.equal(canonicalizeUrl("https://example.com/a?q=hello+world"), "https://example.com/a?q=hello+world")
  })

  it("trims surrounding whitespace before parsing", () => {
    assert.equal(canonicalizeUrl("   https://example.com/a   "), "https://example.com/a")
  })
})

describe("canonicalizeUrl — invalid and hostile input", () => {
  it("throws on input that cannot be a URL at all", () => {
    for (const bad of ["", "   ", "not a url at all", "https://", "javascript:alert(1)", "data:text/html,<h1>x</h1>"]) {
      assert.throws(() => canonicalizeUrl(bad), `expected a throw for ${JSON.stringify(bad)}`)
      assert.equal(canonicalizeUrlSafe(bad), null, `safe variant should be null for ${JSON.stringify(bad)}`)
    }
  })

  it("silently turns a non-http(s) scheme into a bogus https URL", () => {
    // SUSPECT (medium) — the https:// prefix is prepended to the WHOLE
    // string whenever it does not already start with http(s), so a
    // scheme that survives URL parsing produces a key that is not the
    // thing the user submitted.
    //
    // "mailto:a@b.com" is the sharp one: it parses as userinfo
    // "mailto:a" on host "b.com", so the key claims a host the user
    // never named.
    //
    // Latent today: both callers (service.normalizeUrl and
    // guest-store.normalizeUrl) validate the protocol BEFORE this runs.
    // It is a trap for the next caller, not a live bug.
    assert.equal(canonicalizeUrl("mailto:a@b.com"), "https://mailto:a@b.com/")
    assert.equal(canonicalizeUrl("ftp://example.com/a"), "https://ftp//example.com/a")
    assert.equal(canonicalizeUrl("file:///etc/passwd"), "https://file///etc/passwd")
    assert.notEqual(canonicalizeUrlSafe("mailto:a@b.com"), null, "CURRENT BEHAVIOUR: not rejected")
  })

  it("accepts a URL with no host by promoting the path to a host", () => {
    // SUSPECT (low): "https:///a" has no authority; today it becomes
    // the host "a".
    assert.equal(canonicalizeUrl("https:///a"), "https://a/")
  })

  it("KEEPS credentials in the dedup key", () => {
    // SUSPECT (medium, security-adjacent) — two problems in one:
    //
    //   1. the key is persisted in knowledge_items.normalized_url, so
    //      a password pasted in a URL is written to the database in
    //      clear text and survives in backups;
    //   2. the same page with and without credentials produces two
    //      different keys, so dedup misses.
    assert.equal(canonicalizeUrl("https://user:pass@example.com/a"), "https://user:pass@example.com/a")
    assertDistinct(
      "https://user:pass@example.com/a",
      "https://example.com/a",
      "CURRENT BEHAVIOUR: credentials make it a different page",
    )
  })

  it("applies NO length limit", () => {
    // SUSPECT (high) — characterised against the real index in
    // tests/knowledge/dedup.test.ts: a canonical URL past roughly
    // 2670 incompressible bytes cannot be inserted, because the
    // partial unique index is a btree with a 2704-byte row maximum.
    // The user sees a generic 500.
    const long = `https://example.com/${"a".repeat(5000)}`
    const out = canonicalizeUrl(long)
    assert.equal(out.length, long.length, "CURRENT BEHAVIOUR: nothing truncates or rejects")
    assert.notEqual(canonicalizeUrlSafe(long), null)
  })
})

describe("canonicalizeUrlSafe", () => {
  it("returns the same value as canonicalizeUrl when parsing succeeds", () => {
    assert.equal(canonicalizeUrlSafe("https://www.example.com/a/"), canonicalizeUrl("https://www.example.com/a/"))
  })

  it("returns null instead of throwing when it fails", () => {
    assert.equal(canonicalizeUrlSafe("not a url"), null)
  })
})

describe("equivalence — the whole point of the key", () => {
  it("makes every cosmetic variation of one page equal", () => {
    const canonical = canonicalizeUrl("https://example.com/article")
    for (const variant of [
      "https://www.example.com/article",
      "https://WWW.EXAMPLE.COM/article",
      "https://example.com/article/",
      "https://example.com/article#intro",
      "https://example.com/article?utm_source=twitter",
      "https://example.com/article?fbclid=abc&utm_campaign=x",
      "https://example.com:443/article",
      "   https://example.com/article   ",
      "example.com/article",
    ]) {
      assert.equal(canonicalizeUrl(variant), canonical, `${variant} should be the same saved page`)
    }
  })

  it("keeps genuinely different pages apart", () => {
    const pairs: [string, string][] = [
      ["https://example.com/a", "https://example.com/b"],
      ["https://example.com/a?id=1", "https://example.com/a?id=2"],
      ["https://example.com/a", "https://other.com/a"],
      ["https://example.com/a", "https://sub.example.com/a"],
      ["https://youtube.com/watch?v=aaa", "https://youtube.com/watch?v=bbb"],
    ]
    for (const [a, b] of pairs) assertDistinct(a, b, `${a} and ${b} must stay separate`)
  })
})

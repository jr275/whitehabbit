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

import {
  canonicalizeUrl,
  canonicalizeUrlSafe,
  isCanonicalUrlTooLong,
  MAX_CANONICAL_URL_BYTES,
} from "@/lib/knowledge/url"

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

  it("KEEPS a #! or #/ route, because there the fragment is the document", () => {
    // S1, fixed. This test asserted the opposite in the commit that
    // characterised the module: dropping the route made every article
    // on a hash-routed site canonicalise to the app shell, so the first
    // one saved won and every later one came back as "Already in your
    // library" and opened the wrong article. The assertions are flipped
    // because the behaviour changed, not to make a failing test pass —
    // the collapse below is what used to happen and is the bug.
    assert.equal(canonicalizeUrl("https://example.com/app#!/artigo/1"), "https://example.com/app#!/artigo/1")
    assert.equal(canonicalizeUrl("https://example.com/app#!/artigo/2"), "https://example.com/app#!/artigo/2")
    assertDistinct(
      "https://example.com/app#!/artigo/1",
      "https://example.com/app#!/artigo/2",
      "two hashbang articles are two documents",
    )

    assert.equal(canonicalizeUrl("https://example.com/app#/artigo/1"), "https://example.com/app#/artigo/1")
    assertDistinct(
      "https://example.com/app#/artigo/1",
      "https://example.com/app#/artigo/2",
      "two hash-route articles are two documents",
    )
  })

  it("still treats the SAME route as the same document", () => {
    // The point of the key is equivalence, and the fix must not cost it.
    assertSame(
      "https://www.example.com/app#!/artigo/1",
      "https://EXAMPLE.com/app?utm_source=news#!/artigo/1",
      "one route, reached two cosmetically different ways",
    )
  })

  it("does NOT normalise inside the route — the fragment is opaque", () => {
    // Characterisation, not endorsement. A fragment has no structure as
    // far as the URL spec is concerned, so what looks like a query
    // string after "#!" is just more fragment text: tracking params are
    // not stripped there and params are not sorted there. Two links to
    // the same SPA article that differ only by a campaign tag inside
    // the route will therefore save twice.
    //
    // Left as-is deliberately. Parsing the inside of a fragment means
    // guessing a router's private grammar, and guessing wrong collapses
    // distinct articles again — the exact failure this commit fixes.
    // A save too many is recoverable; the wrong article is not.
    assertDistinct(
      "https://example.com/app#!/artigo/1",
      "https://example.com/app#!/artigo/1?utm_source=news",
      "a tracking param INSIDE the route is not stripped",
    )
  })

  it("does not confuse #! with #/", () => {
    assertDistinct(
      "https://example.com/app#!/artigo/1",
      "https://example.com/app#/artigo/1",
      "different routers, different addresses",
    )
  })

  it("leaves ordinary fragments dropped — only routes are kept", () => {
    // The narrowness is the safety: were every fragment preserved, one
    // article pasted twice — once with "#comments" on the end — would
    // become two saves.
    assert.equal(canonicalizeUrl("https://example.com/a#section"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a#comments"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a#L42"), "https://example.com/a")
    assert.equal(canonicalizeUrl("https://example.com/a#!"), "https://example.com/a#!")
  })

  it("percent-encodes a non-ASCII route the same way it encodes a path", () => {
    assert.equal(canonicalizeUrl("https://example.com/app#!/caf\u00e9"), "https://example.com/app#!/caf%C3%A9")
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

  it("does not itself truncate or reject, but reports over-length", () => {
    // S2, fixed — as a separate predicate rather than inside
    // canonicalizeUrl. Canonicalisation stays a pure transform (callers
    // that only want a key for comparison get one); the length rule is
    // a decision, and the callers that persist make it. Nothing is ever
    // truncated: a truncated key collides with every URL sharing its
    // prefix, which turns "too long" into "opens somebody else's page".
    const long = `https://example.com/${"a".repeat(5000)}`
    const out = canonicalizeUrl(long)
    assert.equal(out.length, long.length, "the transform leaves length alone")
    assert.notEqual(canonicalizeUrlSafe(long), null)
    assert.equal(isCanonicalUrlTooLong(out), true, "but it is reported as unsavable")
  })
})

describe("isCanonicalUrlTooLong — the byte ceiling", () => {
  // The limit exists because the dedup key is indexed:
  // uq_knowledge_org_normalized is a btree, and a btree index row caps
  // at 2704 bytes. Measured against the real index with a
  // production-sized 40-char org_id and incompressible content, the
  // hard ceiling sits at ~2642 bytes. MAX_CANONICAL_URL_BYTES is 2048,
  // which leaves ~600 bytes of headroom for a longer org id or another
  // indexed column. tests/knowledge/dedup.test.ts proves the database
  // half of this.
  const pad = (bytes: number) => `https://example.com/${"a".repeat(bytes - "https://example.com/".length)}`

  it("accepts a URL just under the limit", () => {
    const url = pad(MAX_CANONICAL_URL_BYTES - 1)
    assert.equal(url.length, MAX_CANONICAL_URL_BYTES - 1)
    assert.equal(isCanonicalUrlTooLong(canonicalizeUrl(url)), false)
  })

  it("accepts a URL exactly at the limit", () => {
    const url = pad(MAX_CANONICAL_URL_BYTES)
    assert.equal(isCanonicalUrlTooLong(canonicalizeUrl(url)), false, "the limit is inclusive")
  })

  it("rejects a URL one byte over", () => {
    assert.equal(isCanonicalUrlTooLong(canonicalizeUrl(pad(MAX_CANONICAL_URL_BYTES + 1))), true)
  })

  it("counts BYTES, not characters", () => {
    // Canonicalisation percent-encodes today, so this is defence
    // against a future in which it stops: the index is measured in
    // bytes, and a rule written in characters breaks silently.
    const twoByteChars = "\u00e9".repeat(MAX_CANONICAL_URL_BYTES - 100)
    assert.ok(twoByteChars.length < MAX_CANONICAL_URL_BYTES, "under the limit in characters")
    assert.equal(isCanonicalUrlTooLong(twoByteChars), true, "over it in bytes")
  })

  it("is measured on the canonical key, not on what the user typed", () => {
    // A campaign link can be far longer than the page it points at.
    // Checking the input would reject URLs that canonicalise fine.
    const tracking = `https://example.com/a?utm_content=${"x".repeat(3000)}`
    assert.ok(tracking.length > MAX_CANONICAL_URL_BYTES)
    assert.equal(isCanonicalUrlTooLong(canonicalizeUrl(tracking)), false)
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

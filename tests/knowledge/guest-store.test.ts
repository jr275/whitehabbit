/* ================================================================== *
 * GUEST STORE — the browser half of dedup
 *
 * Guest mode (lib/knowledge/guest-store.ts) keeps a library in
 * localStorage for users who are not signed in. It has no database and
 * no unique index, so its duplicate detection is nothing but the shared
 * canonical key from lib/knowledge/url.ts. That makes it the place
 * where a divergence between the two implementations would show up:
 * if the server and the guest store ever disagreed about what "the
 * same page" means, a guest library would stop migrating cleanly into
 * a real account.
 *
 * These tests exist because Commit 6 changed that key. They pin both
 * halves of the change — hash routes are documents (S1), over-long
 * URLs are refused (S2) — on the client side, using the SAME functions
 * the server uses.
 *
 * The module is "use client" and talks to window.localStorage;
 * tests/helpers/browser-env.ts is the smallest thing that satisfies
 * it. Nothing here touches the network: guestSaveUrl fires a metadata
 * lookup that its own try/catch swallows, and that helper's fetch stub
 * keeps it from reaching out.
 * ================================================================== */

import { beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

// Must precede the guest-store import: it installs the window the
// "use client" module reads at load time.
import { localStorage as storage } from "../helpers/browser-env"
import { MAX_CANONICAL_URL_BYTES } from "@/lib/knowledge/url"
import { guestList, guestSaveUrl } from "@/lib/knowledge/guest-store"

beforeEach(() => storage.clear())

const activeUrls = () => guestList({ limit: 100 }).items.map((i) => i.url)

describe("guestSaveUrl — hash routes are distinct documents", () => {
  it("saves two hashbang articles as two items", () => {
    const first = guestSaveUrl("https://example.com/app#!/artigo/1")
    const second = guestSaveUrl("https://example.com/app#!/artigo/2")
    assert.equal(first.duplicate, false)
    assert.equal(second.duplicate, false, "the second article is not the first one")
    assert.equal(activeUrls().length, 2)
  })

  it("saves two hash-route articles as two items", () => {
    guestSaveUrl("https://example.com/app#/artigo/1")
    assert.equal(guestSaveUrl("https://example.com/app#/artigo/2").duplicate, false)
    assert.equal(activeUrls().length, 2)
  })

  it("still recognises the SAME route saved twice", () => {
    // Dedup must survive the fix, through every cosmetic variation the
    // key is supposed to absorb.
    guestSaveUrl("https://example.com/app#!/artigo/1")
    const again = guestSaveUrl("https://WWW.example.com/app/?utm_source=news#!/artigo/1")
    assert.equal(again.duplicate, true)
    assert.equal(activeUrls().length, 1)
  })

  it("still collapses an ordinary anchor", () => {
    guestSaveUrl("https://example.com/article#intro")
    assert.equal(guestSaveUrl("https://example.com/article#comments").duplicate, true)
    assert.equal(activeUrls().length, 1)
  })

  it("agrees with the server, which is the whole point", () => {
    // Same input, same shared key, same verdict. If these two ever
    // drift apart, an exported guest library stops matching the rows
    // it would become.
    guestSaveUrl("https://example.com/app#!/artigo/1")
    assert.equal(guestSaveUrl("https://example.com/app#/artigo/1").duplicate, false, "#! and #/ are not the same")
    assert.equal(activeUrls().length, 2)
  })
})

describe("guestSaveUrl — the byte ceiling", () => {
  const publicUrl = (bytes: number) => {
    const prefix = "https://example.com/"
    return prefix + "a".repeat(bytes - prefix.length)
  }

  it("accepts a URL at the limit", () => {
    assert.equal(guestSaveUrl(publicUrl(MAX_CANONICAL_URL_BYTES)).duplicate, false)
    assert.equal(activeUrls().length, 1)
  })

  it("rejects a URL past the limit, and stores nothing", () => {
    // There is no index here to enforce it — localStorage would take
    // any length. The limit is applied anyway so that a guest library
    // never accumulates rows the authenticated backend would refuse on
    // migration.
    assert.throws(() => guestSaveUrl(publicUrl(MAX_CANONICAL_URL_BYTES + 1)), /too long/i)
    assert.equal(activeUrls().length, 0)
  })

  it("measures the canonical key, not the pasted string", () => {
    // A campaign-laden link can be far longer than the page it names.
    const tracking = `https://example.com/a?utm_content=${"x".repeat(3000)}`
    assert.ok(tracking.length > MAX_CANONICAL_URL_BYTES)
    assert.equal(guestSaveUrl(tracking).duplicate, false, "it canonicalises well under the limit")
  })
})

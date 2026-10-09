/* ================================================================== *
 * THE SIGN-IN SCREEN MUST NOT CLAIM A PRODUCT IT WAS NOT TOLD ABOUT.
 *
 * One route, one session, one users table — and three presentations,
 * chosen from the callbackUrl the middleware already puts in the URL.
 * These cover the two things that can go wrong: reading the wrong
 * product out of a path that merely looks like one, and letting an
 * off-site value choose the chrome.
 * ================================================================== */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { productContextFor } from "@/lib/auth-context"

describe("productContextFor", () => {
  it("reads Knowledge from a Knowledge destination", () => {
    assert.equal(productContextFor("/knowledge"), "knowledge")
    assert.equal(productContextFor("/knowledge/home"), "knowledge")
    assert.equal(productContextFor("/knowledge/read/kn_123"), "knowledge")
  })

  it("reads Workforce from a Workforce destination", () => {
    assert.equal(productContextFor("/workforce"), "workforce")
    assert.equal(productContextFor("/workforce/wk_42"), "workforce")
  })

  it("matches a path SEGMENT, not a prefix", () => {
    // /knowledgebase is not Knowledge, and a screen that claimed it was
    // would be wrong in the one place it is making a claim.
    assert.equal(productContextFor("/knowledgebase"), "neutral")
    assert.equal(productContextFor("/workforces-r-us"), "neutral")
  })

  it("is neutral when nothing was said", () => {
    assert.equal(productContextFor(null), "neutral")
    assert.equal(productContextFor(undefined), "neutral")
    assert.equal(productContextFor(""), "neutral")
    assert.equal(productContextFor("/launch"), "neutral")
    assert.equal(productContextFor("/"), "neutral")
  })

  it("ignores the query string and fragment when deciding", () => {
    assert.equal(productContextFor("/knowledge/library?q=agents"), "knowledge")
    assert.equal(productContextFor("/knowledge#connections"), "knowledge")
  })

  it("REFUSES an off-site value rather than dressing the page in a product", () => {
    // Letting an outside link choose which product the sign-in page
    // claims to be is a cheap way to make a phishing page look right.
    assert.equal(productContextFor("//evil.example/knowledge"), "neutral")
    assert.equal(productContextFor("https://evil.example/knowledge"), "neutral")
    assert.equal(productContextFor("http://localhost/workforce"), "neutral")
    assert.equal(productContextFor("javascript:alert(1)"), "neutral")
  })

  it("accepts a non-string without throwing", () => {
    assert.equal(productContextFor(42 as unknown as string), "neutral")
    assert.equal(productContextFor({} as unknown as string), "neutral")
  })
})

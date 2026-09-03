/* ================================================================== *
 * THE 401 FORK — exercised through the real lib/knowledge/client.ts.
 *
 * auth-state.test.ts proves the decision; this proves the wiring. A
 * 401 is answered two completely different ways depending on the state
 * the provider published, and getting that wrong is silent: the user
 * keeps saving, every save reports success, and the articles land in
 * localStorage under a library they believe is their account.
 *
 * fetch is stubbed rather than mocked at the module boundary, so the
 * code under test is the shipped code path — parse(), the catch block,
 * and shouldFallBackToGuest() — not a re-description of it.
 * ================================================================== */

import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

// Installs window/localStorage before the client module loads.
import { localStorage as storage } from "../helpers/browser-env"
import { AuthRequiredError, publishAuthState } from "@/lib/knowledge/auth-state"
import { fetchLibrary, saveUrl, searchLibrary } from "@/lib/knowledge/client"
import { guestSaveUrl } from "@/lib/knowledge/guest-store"

const realFetch = globalThis.fetch

/** Every Knowledge API call answers 401 — a signed-out or expired
 *  session, which is exactly the same wire response for both. */
function serve401(): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Sign in required." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch
}

beforeEach(() => {
  storage.clear()
  serve401()
})
afterEach(() => {
  globalThis.fetch = realFetch
  publishAuthState("guest")
})

describe("a real guest keeps guest mode", () => {
  it("a 401 list falls back to the browser-local library", async () => {
    publishAuthState("guest")
    guestSaveUrl("https://example.com/an-article")
    const result = await fetchLibrary({ limit: 10 })
    assert.equal(result.items.length, 1, "the guest's own item comes back")
    assert.match(result.items[0].id, /^kn_guest_/)
  })

  it("a 401 save writes to the guest store and reports success honestly", async () => {
    publishAuthState("guest")
    const { item } = await saveUrl("https://example.com/saved-as-guest")
    assert.match(item.id, /^kn_guest_/)
  })

  it("a 401 search falls back too", async () => {
    publishAuthState("guest")
    guestSaveUrl("https://example.com/findable-article")
    const hits = await searchLibrary("findable")
    assert.ok(hits.length >= 1)
  })
})

describe("an expired session does NOT become a guest", () => {
  it("a 401 list throws AuthRequiredError instead of switching stores", async () => {
    publishAuthState("auth_required")
    await assert.rejects(() => fetchLibrary({ limit: 10 }), AuthRequiredError)
  })

  it("a 401 save throws — it must never silently land in localStorage", async () => {
    // The consequential one. Falling back here is data the user thinks
    // is in their account and is not.
    publishAuthState("auth_required")
    const before = storage.getItem("knowledge.guest.items.v1")
    await assert.rejects(() => saveUrl("https://example.com/must-not-be-swallowed"), AuthRequiredError)
    assert.equal(
      storage.getItem("knowledge.guest.items.v1"),
      before,
      "nothing may be written to the guest library",
    )
  })

  it("a 401 search throws rather than quietly searching the wrong library", async () => {
    publishAuthState("auth_required")
    await assert.rejects(() => searchLibrary("anything"), AuthRequiredError)
  })
})

describe("an authenticated user never silently downgrades", () => {
  it("a 401 during a live session is surfaced, not absorbed", async () => {
    // The session was authenticated a moment ago and the server now
    // refuses: that is a real event, not a cue to change storage.
    publishAuthState("authenticated")
    await assert.rejects(() => fetchLibrary({ limit: 10 }), AuthRequiredError)
  })
})

describe("errors that are not 401 keep propagating untouched", () => {
  it("a 500 is a real failure in every state, never a fallback", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Something went wrong. Try again." }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })) as typeof fetch
    for (const state of ["guest", "authenticated", "auth_required"] as const) {
      publishAuthState(state)
      await assert.rejects(
        () => fetchLibrary({ limit: 10 }),
        (err: unknown) => {
          assert.ok(!(err instanceof AuthRequiredError), `500 must not be reported as an auth problem in ${state}`)
          return true
        },
      )
    }
  })

  it("a 404 — the shape requireSession() gives a session with no membership — is not guest mode", async () => {
    // UnauthorizedOrgError maps to 404 (lib/api-error.ts), deliberately,
    // so another tenant's resource cannot be probed for existence. It
    // must not be mistaken for "no auth wired".
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Not found." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })) as typeof fetch
    publishAuthState("authenticated")
    await assert.rejects(
      () => fetchLibrary({ limit: 10 }),
      (err: unknown) => {
        assert.ok(err instanceof Error && !(err instanceof AuthRequiredError))
        return true
      },
    )
  })
})

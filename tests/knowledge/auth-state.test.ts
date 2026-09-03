/* ================================================================== *
 * KNOWLEDGE AUTH STATE — the three-state decision, and the one rule
 * that follows from it: only a real guest gets the guest store.
 *
 * The decision is a pure function, so it is tested as one. What it
 * protects is not: before this existed, lib/knowledge/client.ts treated
 * every 401 as "no auth wired" and quietly switched to localStorage.
 * For a guest that is right. For someone whose session expired it means
 * their saves land in a library they will never see again, while every
 * save reports success — which is why "expired never falls back" gets
 * its own assertions rather than riding along with the happy path.
 * ================================================================== */

import { beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

// Installs the window/localStorage the module reads. Must precede it:
// ES imports evaluate in source order.
import { localStorage as storage } from "../helpers/browser-env"
import {
  AuthRequiredError,
  currentAuthState,
  decideAuthState,
  forgetSignedIn,
  guestFallbackAllowed,
  hasEverSignedIn,
  publishAuthState,
  rememberSignedIn,
  shouldUseGuestStore,
  type SessionStatus,
} from "@/lib/knowledge/auth-state"

beforeEach(() => {
  storage.clear()
  publishAuthState("guest")
})

describe("decideAuthState — the three states", () => {
  it("a live session is authenticated, whatever the history", () => {
    for (const everSignedIn of [true, false]) {
      assert.equal(decideAuthState({ status: "authenticated", everSignedIn }), "authenticated")
    }
  })

  it("never signed in here + no session = guest, not an error", () => {
    // The whole point of guest mode: this is the product for them, not
    // a degraded state, and they must never be asked to sign in as if
    // something broke.
    assert.equal(decideAuthState({ status: "unauthenticated", everSignedIn: false }), "guest")
  })

  it("HAS signed in here + no session = auth_required, not guest", () => {
    // The distinction this module exists for. next-auth reports
    // "unauthenticated" for both an expired cookie and a browser that
    // never had one; only the stored history tells them apart.
    assert.equal(decideAuthState({ status: "unauthenticated", everSignedIn: true }), "auth_required")
  })

  it("carries the last known answer through 'loading' instead of flashing", () => {
    // next-auth reports "loading" on every first paint. A fourth state
    // would show a Sign in button to users who are signed in, for one
    // frame, on every navigation.
    assert.equal(decideAuthState({ status: "loading", everSignedIn: true }), "authenticated")
    assert.equal(decideAuthState({ status: "loading", everSignedIn: false }), "guest")
  })

  it("is total — every status/history pair resolves to a real state", () => {
    const states = new Set<string>()
    for (const status of ["loading", "authenticated", "unauthenticated"] as SessionStatus[]) {
      for (const everSignedIn of [true, false]) {
        const state = decideAuthState({ status, everSignedIn })
        assert.ok(["guest", "authenticated", "auth_required"].includes(state), `${status}/${everSignedIn} -> ${state}`)
        states.add(state)
      }
    }
    assert.equal(states.size, 3, "all three states are reachable")
  })
})

describe("the guest store belongs to exactly one state", () => {
  it("guest uses it", () => {
    assert.equal(shouldUseGuestStore("guest"), true)
  })

  it("authenticated does not — that library lives in Postgres", () => {
    assert.equal(shouldUseGuestStore("authenticated"), false)
  })

  it("auth_required does NOT — this is the silent-data-loss case", () => {
    // If this ever flips to true, an expired session starts writing to
    // localStorage again and reporting success. That is the bug.
    assert.equal(shouldUseGuestStore("auth_required"), false)
  })
})

describe("guestFallbackAllowed — what client.ts asks in its catch block", () => {
  it("defaults to allowed, so a page without the provider behaves as before", () => {
    assert.equal(currentAuthState(), "guest")
    assert.equal(guestFallbackAllowed(), true)
  })

  it("is refused once the state is authenticated or expired", () => {
    publishAuthState("authenticated")
    assert.equal(guestFallbackAllowed(), false)
    publishAuthState("auth_required")
    assert.equal(guestFallbackAllowed(), false)
  })

  it("comes back for a genuine guest", () => {
    publishAuthState("auth_required")
    publishAuthState("guest")
    assert.equal(guestFallbackAllowed(), true)
  })
})

describe("the stored marker", () => {
  it("starts clear and is not set by merely asking", () => {
    assert.equal(hasEverSignedIn(), false)
    assert.equal(hasEverSignedIn(), false)
  })

  it("remembers a session, idempotently", () => {
    rememberSignedIn()
    rememberSignedIn()
    assert.equal(hasEverSignedIn(), true)
  })

  it("is cleared on sign-out, so the next visit is an honest guest", () => {
    // Signing out must not leave the user being told their session
    // expired every time they come back.
    rememberSignedIn()
    forgetSignedIn()
    assert.equal(hasEverSignedIn(), false)
    assert.equal(decideAuthState({ status: "unauthenticated", everSignedIn: hasEverSignedIn() }), "guest")
  })

  it("survives storage being unavailable by degrading to guest", () => {
    // Private mode, or site data blocked: reading throws. The safe
    // direction is forgetting an expired session, never inventing one.
    const broken = {
      getItem() {
        throw new Error("storage disabled")
      },
      setItem() {
        throw new Error("storage disabled")
      },
      removeItem() {
        throw new Error("storage disabled")
      },
    }
    const saved = (globalThis as { window: { localStorage: unknown } }).window.localStorage
    ;(globalThis as { window: { localStorage: unknown } }).window.localStorage = broken
    try {
      assert.equal(hasEverSignedIn(), false)
      assert.doesNotThrow(() => rememberSignedIn())
      assert.doesNotThrow(() => forgetSignedIn())
    } finally {
      ;(globalThis as { window: { localStorage: unknown } }).window.localStorage = saved
    }
  })
})

describe("AuthRequiredError", () => {
  it("is a named error the UI can recognise, not a raw string", () => {
    const err = new AuthRequiredError()
    assert.ok(err instanceof Error)
    assert.equal(err.name, "AuthRequiredError")
    assert.match(err.message, /sign in/i)
  })
})

describe("the full lifecycle a browser actually goes through", () => {
  it("guest -> signs in -> session expires -> signs in -> signs out -> guest", () => {
    const state = () => decideAuthState({ status: current, everSignedIn: hasEverSignedIn() })
    let current: SessionStatus = "unauthenticated"

    assert.equal(state(), "guest", "first visit")

    current = "authenticated"
    rememberSignedIn()
    assert.equal(state(), "authenticated", "signed in")

    current = "unauthenticated"
    assert.equal(state(), "auth_required", "session expired — NOT guest")

    current = "authenticated"
    rememberSignedIn()
    assert.equal(state(), "authenticated", "signed in again")

    forgetSignedIn()
    current = "unauthenticated"
    assert.equal(state(), "guest", "explicit sign-out returns to guest")
  })
})

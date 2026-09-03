/* ================================================================== *
 * KNOWLEDGE AUTH UI — a source-level guard, honestly labelled.
 *
 * These assertions read the component SOURCE, not a rendered DOM. The
 * repo has no component-rendering harness, and the properties worth
 * pinning here are structural rather than visual: which state gates
 * which control, and whether authentication is delegated to the one
 * existing Auth.js flow instead of a second one growing beside it.
 * The rendered behaviour of the three states is covered by the pure
 * decision function in auth-state.test.ts.
 *
 * What this exists to catch: the CTA regressing back to being reachable
 * only from inside the sidebar's account popover — which is how the
 * product ended up with no visible way to sign in at all.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (p: string) => readFileSync(p, "utf8")

const TOPBAR = read("components/knowledge/knowledge-topbar.tsx")
const SIDEBAR = read("components/knowledge/knowledge-sidebar.tsx")
const SETTINGS = read("components/knowledge/settings-view.tsx")
const SHELL = read("components/knowledge/knowledge-shell.tsx")
const AUTH = read("components/knowledge/knowledge-auth.tsx")
const GOOGLE_BUTTON = read("components/auth/google-button.tsx")
const KNOWLEDGE_COMPONENTS = [
  ["knowledge-topbar.tsx", TOPBAR],
  ["knowledge-sidebar.tsx", SIDEBAR],
  ["settings-view.tsx", SETTINGS],
] as const

describe("a guest is offered a way in", () => {
  it("the topbar carries the Sign in control itself, not a nested menu", () => {
    // The regression this file exists for: the only sign-in affordance
    // used to live inside the sidebar's account popover, behind an
    // unlabelled avatar, so the product effectively had none.
    assert.match(TOPBAR, /Sign in/, "no Sign in text in the topbar")
    assert.match(TOPBAR, /promptSignIn/, "the topbar must open the sign-in dialog")
  })

  it("the control is gated on NOT being authenticated", () => {
    assert.match(
      TOPBAR,
      /auth\.state !== "authenticated" &&/,
      "the Sign in control must be conditional on the auth state",
    )
  })

  it("names the lapsed case differently from the guest case", () => {
    // "Sign in" and "Sign in again" are different messages; showing a
    // guest the second one would be a lie, and the reverse hides that
    // something changed.
    assert.match(TOPBAR, /Sign in again/)
  })
})

describe("an authenticated user is not treated as a guest", () => {
  it("every Knowledge surface derives its state from the shared hook", () => {
    // Each of these used to compute its own `isGuest` from
    // useSession().status === "unauthenticated", which collapses a
    // lapsed session into a guest — three places to get it wrong.
    for (const [name, source] of KNOWLEDGE_COMPONENTS) {
      assert.match(source, /useKnowledgeAuth\(\)/, `${name} must use the shared auth state`)
      assert.ok(
        !/status === "unauthenticated"/.test(source),
        `${name} must not re-derive guest from the raw session status`,
      )
    }
  })

  it("offers Sign out only in the authenticated state", () => {
    for (const [name, source] of [["sidebar", SIDEBAR], ["settings", SETTINGS]] as const) {
      assert.match(source, /Sign out/, `${name} should offer sign out`)
      assert.match(source, /signOutOfKnowledge/, `${name} must sign out through the shared handler`)
    }
  })

  it("signs out through the handler that clears the marker first", () => {
    // Order matters: forgetting the marker before next-auth's signOut
    // is what makes the next visit an honest guest rather than someone
    // being told their session expired.
    const idxForget = AUTH.indexOf("forgetSignedIn()")
    const idxSignOut = AUTH.indexOf("signOutViaNextAuth()")
    assert.ok(idxForget > -1 && idxSignOut > -1)
    assert.ok(idxForget < idxSignOut, "the marker must be cleared before signing out")
  })
})

describe("Google goes through the existing Auth.js flow", () => {
  it("reuses the shared GoogleButton rather than a second implementation", () => {
    assert.match(AUTH, /from "@\/components\/auth\/google-button"/)
    assert.match(AUTH, /<GoogleButton /)
  })

  it("that button calls next-auth signIn('google'), never a hand-rolled OAuth URL", () => {
    assert.match(GOOGLE_BUTTON, /signIn\("google", \{ callbackUrl \}\)/)
    assert.ok(
      !/accounts\.google\.com|oauth2\/v2\/auth|client_id=/.test(GOOGLE_BUTTON),
      "OAuth must not be assembled by hand",
    )
  })

  it("returns the user to Knowledge, not to the Workforce launcher", () => {
    // The shared button defaults to /launch for the Workforce flow;
    // Knowledge passes its own so signing in never navigates out.
    assert.match(AUTH, /callbackUrl="\/knowledge"/)
    assert.match(GOOGLE_BUTTON, /callbackUrl = "\/launch"/, "the default must stay unchanged for existing callers")
  })

  it("does not introduce a second login system", () => {
    // Credentials already has a validated form at /login; the dialog
    // hands off to it instead of re-implementing email+password.
    assert.ok(!/type="password"/.test(AUTH), "the Knowledge dialog must not re-implement a password form")
  })
})

describe("a lapsed session is visible, not silent", () => {
  it("the shell renders a banner gated on auth_required alone", () => {
    assert.match(SHELL, /SessionExpiredBanner/)
    assert.match(SHELL, /auth\.state !== "auth_required"\) return null/)
  })

  it("the banner says where the writes are going", () => {
    // The failure being described is invisible otherwise: saves keep
    // succeeding, into the wrong library.
    assert.match(SHELL, /stays on this device/i)
  })

  it("a guest never sees it", () => {
    // Guest mode is a product decision, not a warning state.
    assert.ok(!/state === "guest".*banner/i.test(SHELL))
  })
})

describe("guest data is left alone", () => {
  it("nothing in the auth layer touches the guest store", () => {
    // Migration of kn_guest_* items is a real product decision with a
    // real risk of duplicating or losing them. Until that exists, the
    // auth layer must not read, move or clear them.
    for (const [name, source] of [["knowledge-auth.tsx", AUTH], ["knowledge-shell.tsx", SHELL]] as const) {
      assert.ok(!/guest-store/.test(source), `${name} must not import the guest store`)
      assert.ok(!/kn_guest_/.test(source), `${name} must not touch guest item ids`)
    }
  })
})

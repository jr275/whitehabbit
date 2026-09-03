/* ================================================================== *
 * KNOWLEDGE AUTH STATE — the three states the product actually has,
 * and the one place that decides which one you are in.
 *
 *   guest          never signed in on this browser. The local library
 *                  (guest-store.ts) is the real product for them, not
 *                  a degraded mode.
 *   authenticated  a live session; every read and write goes to
 *                  Postgres through the authenticated API.
 *   auth_required  they HAVE signed in here before, and the session is
 *                  gone — expired, signed out elsewhere, or no longer
 *                  carrying a valid membership.
 *
 * The third state is the reason this module exists. Before it,
 * lib/knowledge/client.ts treated every 401 as "no auth wired" and
 * silently fell back to the browser-local store. For a real guest that
 * is correct and stays correct. For someone whose session expired it
 * is the worst possible failure: they keep saving, each save reports
 * success, and the articles land in localStorage under a library they
 * think is their account. Nothing tells them until they open the app
 * somewhere else and find it empty.
 *
 * WHY A STORED MARKER, AND NOT JUST useSession()
 *
 * An expired JWT and a never-authenticated browser are the same thing
 * to next-auth: both resolve to status "unauthenticated", because the
 * cookie either fails verification or was never there. The difference
 * is history, so history is what we record — one boolean, written the
 * first time a session is observed live and cleared on an explicit
 * sign-out. That makes "your session ended" distinguishable from "you
 * have never signed in", which is exactly the distinction the UI owes
 * the user.
 *
 * No React here on purpose: the decision is a pure function of two
 * inputs, so it can be tested without a DOM, and lib/knowledge/client.ts
 * (which is not a component) can read the resolved state directly.
 * ================================================================== */

/** What next-auth's useSession() reports. Mirrored rather than imported
 *  so this module stays free of React and testable in isolation. */
export type SessionStatus = "loading" | "authenticated" | "unauthenticated"

export type KnowledgeAuthState = "guest" | "authenticated" | "auth_required"

const SEEN_KEY = "knowledge.auth.seen.v1"

/**
 * The whole decision, as a pure function.
 *
 * `loading` deliberately does NOT get a state of its own: next-auth
 * reports it on every first paint, and a UI that renders a fourth
 * "unknown" state would flash a sign-in button at users who are in
 * fact signed in. Instead the last known answer carries through the
 * gap and is corrected a moment later — optimistic, and self-healing.
 */
export function decideAuthState(input: { status: SessionStatus; everSignedIn: boolean }): KnowledgeAuthState {
  if (input.status === "authenticated") return "authenticated"
  if (input.status === "loading") return input.everSignedIn ? "authenticated" : "guest"
  // Resolved to unauthenticated. Whether that is a guest or a lapsed
  // session is precisely what the marker answers.
  return input.everSignedIn ? "auth_required" : "guest"
}

/** The browser-local library is the right answer for exactly one of the
 *  three states. Naming it as a predicate keeps every caller from
 *  re-deriving the rule — and from getting it subtly wrong. */
export function shouldUseGuestStore(state: KnowledgeAuthState): boolean {
  return state === "guest"
}

/* ── The stored marker ────────────────────────────────────────────── *
 * Deliberately localStorage and not a cookie: it is a UI hint, never an
 * authority. Nothing server-side reads it, and forging it grants
 * nothing — the worst a tampered value can do is show its owner a
 * sign-in prompt they did not need, or hide one they did. Authority
 * stays where it belongs, in requireSession(). */

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null
  } catch {
    return null // private mode, or storage disabled entirely
  }
}

export function hasEverSignedIn(): boolean {
  try {
    return storage()?.getItem(SEEN_KEY) === "1"
  } catch {
    return false
  }
}

/** Called the moment a live session is observed. Idempotent. */
export function rememberSignedIn(): void {
  try {
    storage()?.setItem(SEEN_KEY, "1")
  } catch {
    /* nothing to do — the state simply degrades to "guest", which is
       the safe direction: it never hides a real session, it only
       forgets that an expired one used to exist. */
  }
}

/** Called on a deliberate sign-out, so the next visit is an honest
 *  guest rather than someone being told their session expired. */
export function forgetSignedIn(): void {
  try {
    storage()?.removeItem(SEEN_KEY)
  } catch {
    /* see rememberSignedIn */
  }
}

/* ── The resolved state, readable from non-React code ─────────────── *
 * lib/knowledge/client.ts has to decide, inside a catch block, whether
 * a 401 means "fall back to the guest store" or "stop and ask them to
 * sign in". It is a plain module with no access to hooks, so the React
 * provider publishes the current state here. */

let current: KnowledgeAuthState = "guest"

/** Set by KnowledgeAuthProvider whenever the session status changes.
 *  Defaults to "guest" so that a page which never mounts the provider
 *  behaves exactly as it did before this module existed. */
export function publishAuthState(state: KnowledgeAuthState): void {
  current = state
}

export function currentAuthState(): KnowledgeAuthState {
  return current
}

/** The question client.ts actually asks. */
export function guestFallbackAllowed(): boolean {
  return shouldUseGuestStore(current)
}

/** Thrown instead of silently switching stores. The UI turns this into
 *  a sign-in prompt; it is never shown as a raw error string. */
export class AuthRequiredError extends Error {
  constructor(message = "Your session ended. Sign in again to reach your library.") {
    super(message)
    this.name = "AuthRequiredError"
  }
}

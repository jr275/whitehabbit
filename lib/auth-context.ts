/* ================================================================== *
 * WHICH PRODUCT IS THE PERSON SIGNING IN TO?
 *
 * `/login` and `/signup` are ONE route each, backed by one Auth.js
 * configuration, one session and one users table. That is deliberate
 * and it does not change: duplicating the sign-in flow per product
 * would duplicate the part of the system that must never disagree with
 * itself.
 *
 * What differs between the products is the EXPERIENCE, and the only
 * honest signal for which one a person is heading into is where they
 * were going when they were asked to sign in — the `callbackUrl` the
 * middleware already puts in the URL.
 *
 * Three answers, never two: a person arriving at /login with no
 * context has not told us anything, and guessing "Workforce" because
 * that is the platform's default theme would be a guess the screen
 * then states as fact. They get a neutral entry instead.
 *
 * This file has no imports on purpose. It is a pure string decision,
 * so it is unit-testable and cannot drift from the component that
 * consumes it.
 * ================================================================== */

export type ProductContext = "knowledge" | "workforce" | "neutral"

/**
 * Reads the product out of a callback URL.
 *
 * Only a same-site, absolute PATH counts. A protocol-relative value
 * (`//evil.example/knowledge`) or a full URL is treated as no context
 * at all: those are not places this app routes to, and letting one
 * choose the chrome would let an outside link decide which product a
 * sign-in page claims to be — a small thing to dress a phishing page
 * in. The redirect itself is Auth.js's to validate; this only decides
 * what the screen looks like, and it declines to decide on input it
 * does not recognise.
 *
 * Matching is on a path SEGMENT, so `/knowledgebase` is not Knowledge.
 */
export function productContextFor(callbackUrl: string | null | undefined): ProductContext {
  if (typeof callbackUrl !== "string") return "neutral"

  const value = callbackUrl.trim()
  if (!value.startsWith("/") || value.startsWith("//")) return "neutral"

  // Compare the first segment only; query strings and fragments are
  // not part of the routing decision.
  const path = value.split(/[?#]/)[0]
  if (path === "/knowledge" || path.startsWith("/knowledge/")) return "knowledge"
  if (path === "/workforce" || path.startsWith("/workforce/")) return "workforce"
  return "neutral"
}

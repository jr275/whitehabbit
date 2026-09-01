/* ================================================================== *
 * PROXY — security headers for every document, and the page-level
 * auth gate for /studio and /outputs.
 *
 * (Named `proxy` because Next 16 deprecated the `middleware` file
 * convention and renamed it. Same file, same execution point.)
 *
 * ---- WHY THERE IS A CSP NOW ---------------------------------------
 *
 * Milestone 2 renders HTML that came from an arbitrary website. The
 * sanitizer (lib/knowledge/ingestion/extraction/sanitize.ts) is the
 * primary control and runs on WRITE, so nothing unsafe should ever
 * reach storage. A CSP is the second line: it is what limits the blast
 * radius if the sanitizer is ever wrong, and sanitizers are
 * historically the kind of thing that is eventually wrong.
 *
 * The policy is nonce-based with 'strict-dynamic', so an injected
 * <script> cannot execute even if one survives sanitization — an
 * attacker would have to guess a per-request random value.
 *
 * ---- THE ONE DELIBERATE LOOSENING ---------------------------------
 *
 * img-src allows https:. Archived articles keep their images EXTERNAL
 * (M2 §image policy): we record every image URL but download none,
 * because downloading every image on every save is real bandwidth and
 * storage cost for a benefit no current feature needs. Rendering an
 * article therefore means loading images from the publisher, which
 * means allowing https: here.
 *
 * The privacy cost of that is handled where it belongs, in the markup
 * rather than in the policy: the sanitizer stamps every <img> with
 * referrerpolicy="no-referrer", so a publisher learns an IP fetched an
 * image and nothing about which page it was rendered on. Narrowing
 * img-src further would mean proxying or downloading images, which is
 * a later milestone's decision to make.
 *
 * ---- WHAT THIS IS NOT ---------------------------------------------
 *
 * Not the security boundary. Every API route independently calls
 * requireSession() and re-verifies org membership against the database
 * on every request, so a request that somehow skipped this file still
 * cannot reach another workspace's data. This file is a UX
 * convenience plus defence in depth.
 * ================================================================== */

import NextAuth from "next-auth"
import { NextResponse, type NextRequest } from "next/server"
import { authConfig } from "@/lib/auth.config"

/* Built from the edge-safe lib/auth.config.ts alone — no providers, no
 * database import. JWT session verification needs only AUTH_SECRET. */
const { auth } = NextAuth(authConfig)

const isDev = process.env.NODE_ENV === "development"

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' means the nonce, not the origin list, is what
    // authorises a script — so a script we did not put there cannot
    // run even if it is served from our own origin.
    // 'unsafe-eval' in development only: React uses eval to rebuild
    // server stack traces in the browser. Production needs neither.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind and Next both emit inline <style>. Inline CSS is not an
    // execution primitive, and the alternative is a nonce on every
    // style Next generates, which it does not consistently do.
    "style-src 'self' 'unsafe-inline'",
    // See the header comment: article images stay external by design.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Same-origin only: the app talks to its own API and nothing else.
    "connect-src 'self'",
    "media-src 'self'",
    // No plugins, no framing, in either direction.
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    // A <base> tag in saved content must not be able to re-point every
    // relative URL on the page.
    "base-uri 'self'",
    // Saved content must not be able to post anywhere.
    "form-action 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ")
}

/** Headers every response gets, CSP aside. */
function securityHeaders(response: NextResponse): NextResponse {
  // Never let a browser sniff a JSON response into something runnable.
  response.headers.set("X-Content-Type-Options", "nosniff")
  // Belt and braces with frame-ancestors, for anything that predates it.
  response.headers.set("X-Frame-Options", "DENY")
  // A saved article links out to the whole internet. Publishers get the
  // origin at most, and nothing at all when leaving https for http.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  // We ask for none of these; say so, so a compromised page cannot.
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
  return response
}

export default auth((req) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = buildCsp(nonce)

  const isAuthed = Boolean(req.auth)
  const path = req.nextUrl.pathname
  const protectedPath = path.startsWith("/studio") || path.startsWith("/outputs") || path.startsWith("/knowledge")

  if (protectedPath && !isAuthed) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", path)
    return securityHeaders(NextResponse.redirect(loginUrl))
  }

  // Next reads the nonce back out of the request's CSP header and
  // stamps it on the scripts it generates, which is why the header
  // goes on the REQUEST as well as the response.
  const requestHeaders = new Headers((req as unknown as NextRequest).headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return securityHeaders(response)
})

export const config = {
  matcher: [
    {
      /* Everything that is a document or an API response. Static
       * assets and image optimisation are excluded: they carry no
       * markup and no session, so a per-request nonce for them would
       * be pure cost. */
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}

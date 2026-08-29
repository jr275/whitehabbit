/* ================================================================== *
 * MIDDLEWARE — page-level auth gate for /studio, /outputs and the
 * signed-in Pocket2 routes.
 *
 * Builds its own lightweight NextAuth instance from the edge-safe
 * lib/auth.config.ts alone (no providers, no database import) — the
 * Edge runtime this file executes on cannot load Node-only modules
 * like `pg` (lib/db/repo.ts, pulled in by the real Credentials
 * provider in lib/auth.ts). JWT session verification only needs
 * AUTH_SECRET, never the database, so this is sufficient.
 *
 * This is a UX convenience (redirect to /login before the page even
 * renders); it is NOT the security boundary — every API route also
 * independently calls requireSession() (lib/session.ts) and re-
 * verifies org membership against the database on every request, so
 * a request that somehow bypasses this middleware still cannot reach
 * another organization's data.
 * ================================================================== */

import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import { authConfig } from "@/lib/auth.config"
import { POCKET2_LOGIN, POCKET2_PROTECTED_PREFIXES } from "@/lib/pocket2/routes"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isAuthed = !!req.auth
  if (isAuthed) return NextResponse.next()

  const { pathname } = req.nextUrl

  /* Pocket2 signs people in on its own screens, so an unauthenticated
   * request for a Pocket2 route must land on Pocket2's sign-in — not
   * the other product's. */
  if (POCKET2_PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const loginUrl = new URL(POCKET2_LOGIN, req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname.startsWith("/studio") || pathname.startsWith("/outputs")) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

/* Next.js supports exactly one middleware/proxy file per project, so
 * Pocket2 extends this matcher rather than adding a second file.
 *
 * NOTE (Next.js 16): `middleware` is deprecated in favour of `proxy`,
 * which runs on the Node runtime instead of Edge. Renaming this file
 * would let lib/auth.config.ts's edge-safe split be simplified, but
 * that is a change to the existing product's request path and belongs
 * in its own commit, not in Pocket2's foundation. */
export const config = {
  matcher: [
    "/studio/:path*",
    "/outputs/:path*",
    "/pocket2/library/:path*",
    "/pocket2/collections/:path*",
    "/pocket2/tags/:path*",
    "/pocket2/settings/:path*",
    "/pocket2/items/:path*",
    "/pocket2/read/:path*",
  ],
}

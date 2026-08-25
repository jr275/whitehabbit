/* ================================================================== *
 * MIDDLEWARE — page-level auth gate for /studio, /outputs, /marketing,
 * /approvals and /integrations.
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

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isAuthed = !!req.auth
  const protectedPath = ["/studio", "/outputs", "/marketing", "/approvals", "/integrations"].some((p) => req.nextUrl.pathname.startsWith(p))
  if (protectedPath && !isAuthed) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
})

export const config = {
  matcher: ["/studio/:path*", "/outputs/:path*", "/marketing/:path*", "/approvals/:path*", "/integrations/:path*"],
}

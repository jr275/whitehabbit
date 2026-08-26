/* ================================================================== *
 * PROXY (renamed from middleware.ts — this Next.js version deprecates
 * "middleware" in favor of "proxy", which defaults to the Node.js
 * runtime rather than Edge; see node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/proxy.md's version history:
 * "v16.0.0: Middleware is deprecated and renamed to Proxy. Proxy
 * defaults to the Node.js runtime." That is exactly what this file
 * needed: real domain resolution (§16-17) requires a real Postgres
 * query, which the old Edge-runtime middleware.ts could never run.
 *
 * Two independent responsibilities:
 *
 * 1. Tenant-aware public rendering (§16-17, ADR-018): a request whose
 *    Host header matches a VERIFIED tenant domain is rewritten,
 *    server-side, to the existing, already-tested
 *    /sites/:projectId/:slug route — the canonical tenant context
 *    always comes from the verified `domains` row, NEVER from a
 *    client-supplied tenant/project id in a query parameter or path
 *    segment (§16's explicit requirement). An unrecognized host is
 *    never treated as verified — it falls through to normal routing
 *    (a real 404), never silently serving platform content.
 *
 * 2. The pre-existing page-level auth gate for /studio and /outputs —
 *    unchanged in behavior; still just a UX convenience, not the
 *    security boundary (every API route independently calls
 *    requireSession() and re-verifies org membership).
 *
 * Platform-host requests outside /studio and /outputs take a
 * zero-DB-query fast path (a plain hostname string comparison) before
 * this file does anything else, so normal control-plane traffic
 * (including every API route) is unaffected by widening the matcher
 * to cover non-platform hosts too.
 * ================================================================== */

import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { authConfig } from "@/lib/auth.config"
import { resolveAppBaseUrl } from "@/lib/domains/canonical"
import { resolveVerifiedDomain } from "@/lib/domains/repo"

const { auth } = NextAuth(authConfig)

const studioOutputsGate = auth((req) => {
  const isAuthed = !!req.auth
  const protectedPath = req.nextUrl.pathname.startsWith("/studio") || req.nextUrl.pathname.startsWith("/outputs")
  if (protectedPath && !isAuthed) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
})

function isPlatformHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true
  try {
    return new URL(resolveAppBaseUrl()).hostname.toLowerCase() === hostname
  } catch {
    return false
  }
}

export default async function proxy(req: NextRequest, ctx: Parameters<typeof studioOutputsGate>[1]) {
  const hostname = (req.headers.get("host") ?? "").split(":")[0].toLowerCase()

  if (hostname && !isPlatformHost(hostname)) {
    const domain = await resolveVerifiedDomain(hostname)
    if (domain) {
      const url = req.nextUrl.clone()
      const slug = url.pathname.replace(/^\/+/, "")
      url.pathname = `/sites/${domain.projectId}/${slug || "index"}`
      return NextResponse.rewrite(url)
    }
    // an unrecognized/unverified host is never treated as a tenant
    // site — fall through to normal routing (a real 404), never a
    // silent fallback to platform content.
    return NextResponse.next()
  }

  return studioOutputsGate(req, ctx)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

/* ================================================================== *
 * EDGE-SAFE AUTH CONFIG — no providers, no database import. This is
 * the piece middleware.ts uses directly: middleware runs on Vercel's
 * Edge runtime, which cannot load Node-only modules like `pg`
 * (lib/db/repo.ts). Session verification in JWT mode only needs to
 * decrypt the session cookie with AUTH_SECRET — it never needs to
 * touch the database — so this file alone is enough for middleware's
 * redirect-if-unauthenticated check.
 *
 * lib/auth.ts imports this and adds the real Credentials provider
 * (which does touch the database) for use everywhere else (Node
 * runtime API routes, Server Components).
 * ================================================================== */

import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id
        token.organizationId = (user as { organizationId: string }).organizationId
        token.organizationName = (user as { organizationName: string }).organizationName
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        ;(session.user as typeof session.user & { id: string }).id = token.userId as string
      }
      ;(session as typeof session & { organizationId: string; organizationName: string }).organizationId = token.organizationId as string
      ;(session as typeof session & { organizationName: string }).organizationName = token.organizationName as string
      return session
    },
  },
} satisfies NextAuthConfig

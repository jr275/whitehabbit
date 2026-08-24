import "server-only"

/* ================================================================== *
 * AUTH — Auth.js v5 (next-auth@beta), Credentials provider + JWT
 * sessions. Standard library, standard pattern — no homemade password
 * scheme: bcrypt hashing (lib/auth-password.ts) + Auth.js's own signed/
 * encrypted JWT session cookie (AUTH_SECRET).
 *
 * Chosen over an OAuth-only setup because OAuth requires a third-
 * party app registration (Google/GitHub client id+secret) that only
 * the user can create — Credentials-based Auth.js needs no external
 * account to be fully real and production-usable. Adding an OAuth
 * provider later is additive, not a rework: see the "REQUIRED USER
 * ACTION" note in the production report if you want one.
 *
 * This is the full, Node-runtime config (imports the database) — used
 * by API routes and Server Components, never by middleware.ts, which
 * uses the edge-safe lib/auth.config.ts alone.
 * ================================================================== */

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { authConfig } from "@/lib/auth.config"
import { getPrimaryOrgForUser, getUserByEmail } from "@/lib/db/repo"
import { verifyPassword } from "@/lib/auth-password"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : ""
        const password = typeof credentials?.password === "string" ? credentials.password : ""
        if (!email || !password) return null

        const user = await getUserByEmail(email)
        if (!user) return null
        const valid = await verifyPassword(password, user.passwordHash)
        if (!valid) return null

        const org = await getPrimaryOrgForUser(user.id)
        if (!org) return null // a real account with no organization is a data-integrity problem, not something to paper over

        return { id: user.id, email: user.email, organizationId: org.id, organizationName: org.name }
      },
    }),
  ],
})

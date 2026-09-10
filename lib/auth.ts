import "server-only"

/* ================================================================== *
 * AUTH — Auth.js v5 (next-auth@beta). Two real sign-in methods on the
 * ONE shared Whitehabbit account:
 *   1. Credentials (email + bcrypt-hashed password) — always available,
 *      needs no third-party registration.
 *   2. Google OAuth — enabled automatically WHEN, and only when, both
 *      GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set (they are
 *      real app credentials only the account owner can create; nothing
 *      is hard-coded). If unset, the provider simply isn't registered
 *      and the UI hides the Google button — no fake OAuth.
 *
 * Sessions are JWT (AUTH_SECRET-signed). This is the full Node-runtime
 * config (imports the database); middleware.ts uses the edge-safe
 * lib/auth.config.ts alone.
 * ================================================================== */

import NextAuth, { type NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { authConfig } from "@/lib/auth.config"
import { findOrCreateOAuthUser, getPrimaryOrgForUser, getUserByEmail } from "@/lib/db/repo"
import { verifyPassword } from "@/lib/auth-password"
import { googleAuthConfigured, isVerifiedOAuthEmail } from "@/lib/auth-features"

/** Whether to register the Google provider on THIS process's Auth.js
 * config. Evaluated once, which is correct here and only here: the
 * provider list is built when this module loads and Auth.js keeps it
 * for the life of the process.
 *
 * Pages must NOT use this. They need lib/auth-features'
 * googleAuthConfigured(), which reads fresh — see that module for what
 * the difference costs. */
const registerGoogleProvider = googleAuthConfigured()

const providers: NextAuthConfig["providers"] = [
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
      if (!user || !user.passwordHash) return null // OAuth-only account: no local password to check
      const valid = await verifyPassword(password, user.passwordHash)
      if (!valid) return null

      const org = await getPrimaryOrgForUser(user.id)
      if (!org) return null // a real account with no organization is a data-integrity problem, not something to paper over

      return { id: user.id, email: user.email, organizationId: org.id, organizationName: org.name }
    },
  }),
]

if (registerGoogleProvider) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true, // link Google to an existing same-email account instead of erroring
    }),
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    /** Google returns its own profile, not our DB row. Resolve (or
     * create) the real Whitehabbit user+org here, then stamp the real
     * ids onto the token. Credentials sign-in already carries them
     * from authorize(), so it falls through to the base jwt callback. */
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        // The email is the ONLY thing that links this Google identity
        // to a Whitehabbit account (allowDangerousEmailAccountLinking
        // above), so it has to be an address Google says it verified.
        // Refuse rather than degrade: returning a token without ids
        // would produce a half-signed-in state that looks authenticated
        // to middleware and fails at every API call. See
        // isVerifiedOAuthEmail for what this is defending against.
        if (!isVerifiedOAuthEmail(profile)) {
          throw new Error("Google did not confirm this email address is verified.")
        }
        const email = (profile?.email as string | undefined) ?? user?.email ?? undefined
        if (email) {
          const { user: dbUser, org } = await findOrCreateOAuthUser({
            email,
            displayName: (profile?.name as string | undefined) ?? user?.name ?? null,
            imageUrl: (profile?.picture as string | undefined) ?? user?.image ?? null,
          })
          token.userId = dbUser.id
          token.organizationId = org.id
          token.organizationName = org.name
        }
        return token
      }
      return authConfig.callbacks!.jwt!({ token, user, account, profile } as never)
    },
  },
})

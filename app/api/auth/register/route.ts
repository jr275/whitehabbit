import "server-only"

/* POST /api/auth/register — real sign-up. Creates a user (bcrypt-
 * hashed password, never stored or logged in plaintext) and a new
 * personal organization together, atomically (see
 * createUserWithOrganization). The client then calls Auth.js's own
 * signIn("credentials", ...) — this route never issues a session
 * itself, it only creates the account Auth.js will authenticate. */

import { NextResponse } from "next/server"
import { hashPassword, isPasswordAcceptable } from "@/lib/auth-password"
import { withApiHandler, ValidationError } from "@/lib/api-error"
import { createUserWithOrganization, getUserByEmail } from "@/lib/db/repo"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  return withApiHandler("auth.register", async () => {
    const body = (await req.json().catch(() => null)) as { email?: string; password?: string; organizationName?: string } | null
    const email = body?.email?.trim().toLowerCase() ?? ""
    const password = body?.password ?? ""
    const organizationName = body?.organizationName?.trim() || `${email.split("@")[0]}'s organization`

    if (!EMAIL_RE.test(email)) throw new ValidationError("Enter a valid email address.")
    if (!isPasswordAcceptable(password)) throw new ValidationError("Password must be at least 8 characters.")

    const existing = await getUserByEmail(email)
    if (existing) throw new ValidationError("An account with this email already exists.")

    const passwordHash = await hashPassword(password)
    const { user, org } = await createUserWithOrganization(email, passwordHash, organizationName)

    return NextResponse.json({ user: { id: user.id, email: user.email }, organization: { id: org.id, name: org.name } })
  })
}

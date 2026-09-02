import "server-only"

/* POST /api/auth/reset-password — completes a REAL password reset.
 *
 * Consumes a single-use token (matched by its SHA-256 hash), verifies
 * it is unexpired and unused, and sets the new bcrypt password hash —
 * all in one transaction so a token can never be spent twice. Setting a
 * password on an OAuth-only account additionally enables credentials
 * sign-in for it, which is expected. */

import { NextResponse } from "next/server"
import { withApiHandler, ValidationError } from "@/lib/api-error"
import { enforceRateLimit } from "@/lib/rate-limit"
import { hashPassword, hashToken, isPasswordAcceptable } from "@/lib/auth-password"
import { resetPasswordWithToken } from "@/lib/db/repo"
import { clientIpFrom } from "@/lib/auth-features"

export async function POST(req: Request) {
  return withApiHandler("auth.reset_password", async () => {
    await enforceRateLimit("auth_reset_password", clientIpFrom(req))

    const body = (await req.json().catch(() => null)) as { token?: string; password?: string } | null
    const token = body?.token?.trim() ?? ""
    const password = body?.password ?? ""

    if (!token) throw new ValidationError("This reset link is invalid.")
    if (!isPasswordAcceptable(password)) throw new ValidationError("Password must be at least 8 characters.")

    const ok = await resetPasswordWithToken(hashToken(token), await hashPassword(password))
    if (!ok) throw new ValidationError("This reset link has expired or already been used. Request a new one.")

    return NextResponse.json({ ok: true })
  })
}

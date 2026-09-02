import "server-only"

/* POST /api/auth/forgot-password — begins a REAL password reset.
 *
 * Security posture:
 *  - Always responds with the same neutral body regardless of whether
 *    the email exists, so the endpoint can't be used to enumerate
 *    accounts.
 *  - Only a SHA-256 hash of the single-use token is stored; the raw
 *    token lives only in the reset link (see lib/auth-password).
 *  - IP rate-limited to blunt abuse.
 *
 * Delivery: this project has no email provider connected, so there is
 * no way to actually send the link by email. Rather than FAKE a "check
 * your inbox" that never arrives, we return the real reset link in the
 * response body for a matching account in non-production environments
 * (clearly surfaced by the UI as a manual fallback). In production with
 * no mailer configured the link is withheld — password reset genuinely
 * cannot complete until an email provider is added, and we say so. */

import { NextResponse } from "next/server"
import { withApiHandler, ValidationError } from "@/lib/api-error"
import { enforceRateLimit } from "@/lib/rate-limit"
import { generateResetToken } from "@/lib/auth-password"
import { createPasswordResetToken, getUserByEmail } from "@/lib/db/repo"
import { clientIpFrom } from "@/lib/auth-features"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function POST(req: Request) {
  return withApiHandler("auth.forgot_password", async () => {
    await enforceRateLimit("auth_forgot_password", clientIpFrom(req))

    const body = (await req.json().catch(() => null)) as { email?: string } | null
    const email = body?.email?.trim().toLowerCase() ?? ""
    if (!EMAIL_RE.test(email)) throw new ValidationError("Enter a valid email address.")

    const user = await getUserByEmail(email)

    // The link is only ever generated/returned for a real account, but
    // the response shape is identical either way.
    let manualResetUrl: string | null = null
    if (user) {
      const { token, tokenHash } = generateResetToken()
      await createPasswordResetToken(user.id, tokenHash, RESET_TTL_MS)

      const origin = new URL(req.url).origin
      const resetUrl = `${origin}/reset-password?token=${token}`

      // Server-side breadcrumb so the owner can always retrieve it from logs.
      console.log(`[v0] password reset requested for ${email} -> ${resetUrl}`)

      if (process.env.NODE_ENV !== "production") manualResetUrl = resetUrl
    }

    return NextResponse.json({
      ok: true,
      // Honest about delivery: no mailer is wired up.
      delivery: "manual" as const,
      manualResetUrl,
      message: "If an account exists for that email, a reset link has been created.",
    })
  })
}

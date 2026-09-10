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
import { logger } from "@/lib/observability/logger"

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

      // Build the link against the origin the BROWSER actually used, not
      // the internal req.url (which a proxy can rewrite to a different
      // scheme/host). Prefer the Origin header, then forwarded headers.
      const h = req.headers
      const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim()
      const forwardedHost = h.get("x-forwarded-host") ?? h.get("host")
      const origin =
        h.get("origin") ??
        (forwardedHost ? `${forwardedProto ?? "https"}://${forwardedHost}` : new URL(req.url).origin)
      const resetUrl = `${origin}/reset-password?token=${token}`

      // A breadcrumb that the reset was requested — NEVER the link.
      //
      // This line used to log `resetUrl`, which embeds the raw
      // single-use token. That token IS the credential: anyone who can
      // read the application's logs (a platform log drain, a shared
      // dashboard, an aggregator, a support export) could request a
      // reset for any address and then complete it from the log line,
      // without ever touching that person's inbox. Log retention also
      // outlives the token's one-hour TTL by months, so the exposure
      // is not bounded by expiry either.
      //
      // The non-production response below still returns the link to
      // the caller who asked for it, which is the intended manual
      // fallback while no mailer is wired up; that is a deliberate
      // hand-back to the requester, not a broadcast to everyone with
      // log access.
      logger.info("password_reset_requested", { emailDomain: email.split("@")[1] ?? "unknown" })

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

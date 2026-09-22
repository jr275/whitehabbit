import "server-only"

/* ================================================================== *
 * EMAIL PROVIDER BOUNDARY — the seam, and deliberately nothing behind
 * it yet.
 *
 * Two flows in this codebase mint a real, single-use, expiring token
 * and then have nowhere to send it: password reset (lib/db/repo.ts →
 * createPasswordResetToken) and email verification
 * (createEmailVerificationToken). The token halves are complete and
 * tested; delivery is the missing dependency.
 *
 * WHY NO IMPLEMENTATION IS INCLUDED. Picking Resend, SendGrid or SES
 * means adding a dependency, an account, a credential and a sending
 * domain — none of which can be chosen from inside the code, and all
 * of which would have to be undone if the wrong one were guessed. What
 * CAN be settled here is the shape everything else codes against, so
 * adding the real one later touches this file and no other.
 *
 * THE UNCONFIGURED PROVIDER IS NOT A NO-OP. It reports failure. A
 * silent success would mean the reset route believes a link was sent,
 * tells the user to check their inbox, and nothing ever arrives —
 * exactly the fabricated behaviour the rest of this codebase refuses.
 * ================================================================== */

export interface PasswordResetEmail {
  to: string
  /** The full link, containing the raw single-use token. NEVER logged
   *  by any implementation of this interface — see the comment in
   *  app/api/auth/forgot-password/route.ts for what that cost. */
  resetUrl: string
  expiresInMinutes: number
}

export interface EmailVerificationEmail {
  to: string
  verifyUrl: string
  expiresInMinutes: number
}

export type EmailDeliveryResult =
  | { ok: true; provider: string }
  /** `not_configured` is a deployment state, not a failure of this
   *  request — callers surface it differently, because "no mailer is
   *  set up" and "the mailer rejected this address" need different
   *  responses. */
  | { ok: false; reason: "not_configured" | "provider_error"; message: string }

export interface EmailProvider {
  readonly id: string
  isConfigured(): boolean
  notConfiguredReason(): string
  sendPasswordReset(email: PasswordResetEmail): Promise<EmailDeliveryResult>
  sendEmailVerification(email: EmailVerificationEmail): Promise<EmailDeliveryResult>
}

/** The only provider that exists today. It sends nothing and says so. */
const unconfiguredProvider: EmailProvider = {
  id: "none",
  isConfigured: () => false,
  notConfiguredReason: () =>
    "No email provider is configured for this deployment, so links cannot be delivered by email.",
  async sendPasswordReset() {
    return { ok: false, reason: "not_configured", message: unconfiguredProvider.notConfiguredReason() }
  },
  async sendEmailVerification() {
    return { ok: false, reason: "not_configured", message: unconfiguredProvider.notConfiguredReason() }
  },
}

/**
 * Resolves the provider for this deployment.
 *
 * A real implementation registers here — one module, one branch — and
 * every caller keeps working unchanged. Kept as a function rather than
 * a constant so configuration is read at call time: a deployment that
 * sets a credential must not need a rebuild to start sending.
 */
export function emailProvider(): EmailProvider {
  return unconfiguredProvider
}

export function isEmailDeliveryConfigured(): boolean {
  return emailProvider().isConfigured()
}

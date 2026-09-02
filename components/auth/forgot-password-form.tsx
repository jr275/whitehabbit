"use client"

/* FORGOT PASSWORD — requests a real reset token. Because no email
 * provider is connected, the API returns the reset link directly (in
 * non-production) and this form surfaces it honestly instead of
 * pretending an email was sent. */

import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ message: string; manualResetUrl: string | null } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const body = await res.json().catch(() => null)
    setSubmitting(false)
    if (!res.ok) {
      setError(body?.error ?? "Could not start a password reset.")
      return
    }
    setDone({ message: body.message, manualResetUrl: body.manualResetUrl ?? null })
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-[13px] leading-relaxed text-foreground">{done.message}</p>
        </div>

        {done.manualResetUrl ? (
          <div className="rounded-xl border border-warn/30 bg-warn/8 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-warn">Email delivery not configured</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              No email provider is connected, so we can&apos;t send this by email. Use your secure, single-use reset
              link directly:
            </p>
            <Link
              href={done.manualResetUrl}
              className="mt-3 inline-block break-all rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-primary hover:underline"
            >
              {done.manualResetUrl}
            </Link>
          </div>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            If an email provider is configured, a reset link is on its way. The link expires in one hour.
          </p>
        )}

        <Link
          href="/login"
          className="mt-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="modal-input h-11"
            placeholder="you@company.com"
          />
        </label>

        {error && (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          {submitting ? "Creating link…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-muted-foreground">
        <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </p>
    </>
  )
}

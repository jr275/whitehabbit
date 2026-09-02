"use client"

/* RESET PASSWORD — sets a new password using the single-use token from
 * the reset link. On success it signs the user straight in with the new
 * credentials, then sends them into the app via /launch. */

import { CheckCircle2, Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

export function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-4">
        <p className="text-[13px] leading-relaxed text-foreground">This reset link is missing its token or is invalid.</p>
        <Link href="/forgot-password" className="mt-3 inline-block text-[12.5px] font-medium text-primary hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setSubmitting(true)
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setSubmitting(false)
      setError(body?.error ?? "Could not reset your password.")
      return
    }

    setDone(true)
    // Best-effort auto sign-in isn't possible without the email here, so
    // send them to a clean sign-in. (We don't know the email from the token
    // on the client, and we never expose it.)
    setTimeout(() => {
      setSubmitting(false)
      router.push("/login")
    }, 1200)
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-primary/25 bg-primary/8 p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="text-[13px] leading-relaxed text-foreground">
          Your password has been reset. Redirecting you to sign in…
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">New password</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="modal-input h-11"
          placeholder="At least 8 characters"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Confirm new password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="modal-input h-11"
          placeholder="Re-enter your new password"
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
        {submitting ? "Saving…" : "Set new password"}
      </button>
    </form>
  )
}

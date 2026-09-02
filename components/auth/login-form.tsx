"use client"

/* LOGIN — real Auth.js Credentials sign-in. No mock session, no
 * bypass: a wrong password shows the real reason and nothing else
 * happens. On success we route to /launch, which decides whether the
 * user still needs onboarding or goes straight to their product. */

import { Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { AuthDivider, GoogleButton } from "./google-button"

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await signIn("credentials", { email, password, redirect: false })
    if (result?.error) {
      setSubmitting(false)
      setError("Incorrect email or password.")
      return
    }
    router.push(params.get("callbackUrl") || "/launch")
    router.refresh()
  }

  return (
    <>
      {googleEnabled && (
        <>
          <GoogleButton />
          <AuthDivider />
        </>
      )}

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

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Password</span>
            <Link href="/forgot-password" className="text-[11px] text-primary hover:underline">
              Forgot password?
            </Link>
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="modal-input h-11"
            placeholder="••••••••"
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
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create account
        </Link>
      </p>
    </>
  )
}

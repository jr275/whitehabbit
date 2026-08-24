"use client"

/* ------------------------------------------------------------------ *
 * LOGIN — real Auth.js Credentials sign-in. No mock session, no bypass:
 * a wrong password shows the real reason and nothing else happens.
 * ------------------------------------------------------------------ */

import { Circle, Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

function LoginForm() {
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
    setSubmitting(false)
    if (result?.error) {
      setError("Incorrect email or password.")
      return
    }
    router.push(params.get("callbackUrl") || "/studio")
    router.refresh()
  }

  return (
    <div className="studio-surface flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Circle className="h-3.5 w-3.5 fill-primary-foreground text-primary-foreground" />
          </span>
          <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground">WhiteHabbit</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-[17px] font-semibold text-foreground">Sign in</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Sign in to your organization's real Worker Studio.</p>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="modal-input" placeholder="you@company.com" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Password</span>
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="modal-input" placeholder="••••••••" />
            </label>
            {error && <p className="text-[12px] text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
          No account? <Link href="/signup" className="text-primary hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

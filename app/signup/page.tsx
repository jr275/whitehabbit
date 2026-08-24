"use client"

/* ------------------------------------------------------------------ *
 * SIGN UP — real account creation: POST /api/auth/register (bcrypt-
 * hashed password, a real user + organization row), then a real
 * Auth.js sign-in with the same credentials. No demo/bypass session.
 * ------------------------------------------------------------------ */

import { Circle, Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [organizationName, setOrganizationName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, organizationName: organizationName || undefined }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setSubmitting(false)
      setError(body?.error ?? "Could not create your account.")
      return
    }

    const result = await signIn("credentials", { email, password, redirect: false })
    setSubmitting(false)
    if (result?.error) {
      setError("Account created — sign in on the login page.")
      router.push("/login")
      return
    }
    router.push("/studio")
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
          <h1 className="text-[17px] font-semibold text-foreground">Create your organization</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">A real account and organization — your Workers are never visible to anyone outside it.</p>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Organization name</span>
              <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className="modal-input" placeholder="Acme Inc." />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="modal-input" placeholder="you@company.com" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Password</span>
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="modal-input" placeholder="At least 8 characters" />
            </label>
            {error && <p className="text-[12px] text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Creating…" : "Create account"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
          Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

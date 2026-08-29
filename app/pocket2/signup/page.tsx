"use client"

/* ------------------------------------------------------------------ *
 * SIGN UP — posts to the application's existing /api/auth/register,
 * which creates the user and their workspace atomically, then signs in
 * through the same Credentials provider. Pocket2 adds a screen here,
 * not an authentication system.
 * ------------------------------------------------------------------ */

import { Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AuthShell, Field, FormError } from "@/components/pocket2/auth-shell"
import { POCKET2_HOME } from "@/lib/pocket2/routes"

export default function Pocket2SignupPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")
    const password = String(form.get("password") ?? "")
    const workspaceName = String(form.get("workspaceName") ?? "").trim()

    setSubmitting(true)
    setError(null)

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, organizationName: workspaceName || undefined }),
    })

    if (!response.ok) {
      // Surfaces the server's real validation message ("Password must
      // be at least 8 characters") rather than a generic failure.
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "We couldn't create that account.")
      setSubmitting(false)
      return
    }

    const result = await signIn("credentials", { email, password, redirect: false })
    if (result?.error) {
      // The account exists — only the automatic sign-in failed. Say so
      // honestly instead of implying the sign-up did not work.
      setError("Your account was created, but signing in failed. Try signing in.")
      setSubmitting(false)
      return
    }

    router.push(POCKET2_HOME)
    router.refresh()
  }

  return (
    <AuthShell
      title="Create your library"
      subtitle="Save your first link in under a minute."
      footer={<>Already have an account? <Link href="/pocket2/login" className="p2-link">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <Field label="Email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@example.com" />
        <Field
          label="Password" name="password" type="password" required minLength={8}
          autoComplete="new-password" placeholder="At least 8 characters" hint="Use 8 characters or more."
        />
        <Field
          label="Workspace name" name="workspaceName" type="text" autoComplete="organization"
          placeholder="Optional" hint="Leave blank and we'll name it after you."
        />
        <FormError>{error}</FormError>
        <button type="submit" disabled={submitting} className="p2-btn p2-btn-primary mt-1 w-full">
          {submitting ? <><Loader2 className="animate-spin" aria-hidden="true" /> Creating…</> : "Create account"}
        </button>
      </form>
    </AuthShell>
  )
}

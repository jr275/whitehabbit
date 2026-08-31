"use client"

/* ------------------------------------------------------------------ *
 * SIGN IN — Pocket2's own screen over the application's EXISTING
 * Auth.js Credentials provider (lib/auth.ts). No second auth system,
 * no bypass: a wrong password produces the real failure and nothing
 * else happens.
 * ------------------------------------------------------------------ */

import { Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { AuthShell, Field, FormError } from "@/components/pocket2/auth-shell"
import { POCKET2_HOME } from "@/lib/pocket2/routes"

/** FormData.get() returns `string | File | null`. Coercing a File with
 * String() yields "[object File]", so a field submitted as a file
 * would silently become nonsense instead of failing validation. */
function text(form: FormData, field: string): string {
  const value = form.get(field)
  return typeof value === "string" ? value : ""
}

function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError(null)

    const result = await signIn("credentials", {
      email: text(form, "email"),
      password: text(form, "password"),
      redirect: false,
    })

    if (result?.error) {
      // Deliberately does not distinguish "no such account" from "wrong
      // password" — that difference is an account-enumeration oracle.
      setError("That email and password don't match an account.")
      setSubmitting(false)
      return
    }

    // Only trust a same-origin relative callback: an attacker-supplied
    // absolute URL here would turn sign-in into an open redirect.
    const requested = params.get("callbackUrl")
    const destination = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : POCKET2_HOME
    router.push(destination)
    router.refresh()
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your library."
      footer={<>New here? <Link href="/pocket2/signup" className="p2-link">Create an account</Link></>}
    >
      <form onSubmit={(event) => void onSubmit(event)} className="mt-6 flex flex-col gap-4">
        <Field label="Email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@example.com" />
        <Field label="Password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
        <FormError>{error}</FormError>
        <button type="submit" disabled={submitting} className="p2-btn p2-btn-primary mt-1 w-full">
          {submitting ? <><Loader2 className="animate-spin" aria-hidden="true" /> Signing in…</> : "Sign in"}
        </button>
      </form>
    </AuthShell>
  )
}

export default function Pocket2LoginPage() {
  // useSearchParams needs a Suspense boundary so the rest of the route
  // can still be prerendered.
  return <Suspense fallback={null}><SignInForm /></Suspense>
}

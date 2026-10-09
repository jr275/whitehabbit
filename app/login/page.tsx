import { Suspense } from "react"
import { AuthLayout } from "@/components/auth/auth-layout"
import { LoginForm } from "@/components/auth/login-form"
import { productContextFor } from "@/lib/auth-context"
import { googleAuthConfigured, notConfiguredMessage } from "@/lib/auth-features"

/* Rendered per request, not prerendered. googleAuthConfigured() reads
 * the environment, and a prerendered page would freeze that answer at
 * build time — which is exactly the bug this replaces. The product
 * context below is per-request for the same reason: it comes from the
 * URL, so a prerendered page would serve one product's entry to
 * everyone. */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sign in — Whitehabbit",
  description: "Sign in to your Whitehabbit account.",
}

/* One route, one Auth.js configuration, one session. Only the words
 * and the identity change with the destination. */
const COPY = {
  knowledge: {
    title: "Sign in to Keeply",
    subtitle: "Continue to your knowledge library.",
  },
  workforce: {
    title: "Sign in to Menlo Whitehabbit",
    subtitle: "Continue to your AI workforce.",
  },
  neutral: {
    title: "Sign in",
    subtitle: "One account for your AI workforce and your knowledge library.",
  },
} as const

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl
  const context = productContextFor(raw)
  const copy = COPY[context]

  return (
    <AuthLayout context={context} eyebrow="Welcome back" title={copy.title} subtitle={copy.subtitle}>
      <Suspense>
        <LoginForm googleEnabled={googleAuthConfigured()} notConfigured={notConfiguredMessage()} />
      </Suspense>
    </AuthLayout>
  )
}

import { Suspense } from "react"
import { AuthLayout } from "@/components/auth/auth-layout"
import { LoginForm } from "@/components/auth/login-form"
import { googleAuthConfigured } from "@/lib/auth-features"

/* Rendered per request, not prerendered. googleAuthConfigured() reads
 * the environment, and a prerendered page would freeze that answer at
 * build time — which is exactly the bug this replaces. */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sign in — Whitehabbit",
  description: "Sign in to your Whitehabbit account.",
}

export default function LoginPage() {
  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to Whitehabbit"
      subtitle="Continue to your workforce and your knowledge library."
    >
      <Suspense>
        <LoginForm googleEnabled={googleAuthConfigured()} />
      </Suspense>
    </AuthLayout>
  )
}

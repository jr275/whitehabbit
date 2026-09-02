import { Suspense } from "react"
import { AuthLayout } from "@/components/auth/auth-layout"
import { LoginForm } from "@/components/auth/login-form"
import { isGoogleConfigured } from "@/lib/auth"

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
        <LoginForm googleEnabled={isGoogleConfigured} />
      </Suspense>
    </AuthLayout>
  )
}

import { Suspense } from "react"
import { AuthLayout } from "@/components/auth/auth-layout"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata = {
  title: "Set a new password — Whitehabbit",
  description: "Choose a new password for your Whitehabbit account.",
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Set a new password"
      subtitle="Choose a strong password you don't use anywhere else."
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  )
}

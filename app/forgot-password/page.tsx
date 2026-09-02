import { AuthLayout } from "@/components/auth/auth-layout"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata = {
  title: "Reset your password — Whitehabbit",
  description: "Request a secure link to reset your Whitehabbit password.",
}

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Forgot your password?"
      subtitle="Enter the email on your account and we'll create a secure, single-use link to set a new password."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  )
}

import { AuthLayout } from "@/components/auth/auth-layout"
import { SignupForm } from "@/components/auth/signup-form"
import { isGoogleConfigured } from "@/lib/auth"

export const metadata = {
  title: "Create your account — Whitehabbit",
  description: "Start your Whitehabbit organization — an AI workforce and a knowledge library in one workspace.",
}

export default function SignupPage() {
  return (
    <AuthLayout
      eyebrow="Get started"
      title="Two products. One workspace."
      subtitle="Create an organization to run an autonomous AI workforce and build a knowledge library that thinks with you."
    >
      <SignupForm googleEnabled={isGoogleConfigured} />
    </AuthLayout>
  )
}

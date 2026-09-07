import { AuthLayout } from "@/components/auth/auth-layout"
import { SignupForm } from "@/components/auth/signup-form"
import { googleAuthConfigured } from "@/lib/auth-features"

/* Rendered per request, not prerendered. googleAuthConfigured() reads
 * the environment, and a prerendered page would freeze that answer at
 * build time — which is exactly the bug this replaces. */
export const dynamic = "force-dynamic"

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
      <SignupForm googleEnabled={googleAuthConfigured()} />
    </AuthLayout>
  )
}

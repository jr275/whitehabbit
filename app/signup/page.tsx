import { Suspense } from "react"
import { AuthLayout } from "@/components/auth/auth-layout"
import { SignupForm } from "@/components/auth/signup-form"
import { productContextFor } from "@/lib/auth-context"
import { googleAuthConfigured } from "@/lib/auth-features"

/* Per-request: googleAuthConfigured() reads the environment, and the
 * product context is read from the URL. */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Create your account — Whitehabbit",
  description: "Start your Whitehabbit organization — an AI workforce and a knowledge library in one workspace.",
}

const COPY = {
  knowledge: {
    title: "Start your library.",
    subtitle: "Create an account and Keeply will read, organize and connect everything you save.",
  },
  workforce: {
    title: "Build your workforce.",
    subtitle: "Create an organization to design, test and operate autonomous AI workers.",
  },
  neutral: {
    title: "Two products. One workspace.",
    subtitle:
      "Create an organization to run an autonomous AI workforce and build a knowledge library that thinks with you.",
  },
} as const

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl
  const context = productContextFor(raw)
  const copy = COPY[context]

  return (
    <AuthLayout context={context} eyebrow="Get started" title={copy.title} subtitle={copy.subtitle}>
      <Suspense>
        <SignupForm googleEnabled={googleAuthConfigured()} />
      </Suspense>
    </AuthLayout>
  )
}

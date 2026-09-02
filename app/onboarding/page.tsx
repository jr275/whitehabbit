import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getOnboardingState } from "@/lib/db/repo"
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Welcome to Whitehabbit",
  description: "Set up your workspace.",
}

export default async function OnboardingPage() {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session || !userId) redirect("/login?callbackUrl=/onboarding")

  // Already onboarded? Don't make them do it twice.
  const { completed, interests } = await getOnboardingState(userId)
  if (completed) redirect("/")

  const orgName = (session as { organizationName?: string }).organizationName ?? ""
  return <OnboardingFlow email={session.user?.email ?? ""} organizationName={orgName} initialInterests={interests} />
}

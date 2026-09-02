import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getOnboardingState } from "@/lib/db/repo"

/* /launch — the single post-authentication router. Every sign-in path
 * (credentials, Google, password reset) lands here. It has no UI: it
 * reads the real onboarding state for the signed-in user and sends
 * first-run accounts through onboarding, everyone else into the app.
 * Kept server-only and dynamic so the decision always reflects the
 * live database, never a cached shell. */

export const dynamic = "force-dynamic"

export default async function LaunchPage() {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session || !userId) redirect("/login?callbackUrl=/launch")

  const { completed } = await getOnboardingState(userId)
  redirect(completed ? "/" : "/onboarding")
}

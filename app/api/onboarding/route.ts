import "server-only"

/* POST /api/onboarding — records the shared account's first-run choices
 * (chosen interest topics) and stamps onboarding as complete. Reads its
 * identity from the verified session only; interests are persisted to
 * the real user_interests table, scoped to the signed-in user. */

import { NextResponse } from "next/server"
import { withApiHandler, ValidationError } from "@/lib/api-error"
import { requireSession } from "@/lib/session"
import { completeOnboarding, getOnboardingState } from "@/lib/db/repo"

export async function GET() {
  return withApiHandler("onboarding.get", async () => {
    const { userId } = await requireSession()
    const state = await getOnboardingState(userId)
    return NextResponse.json(state)
  })
}

export async function POST(req: Request) {
  return withApiHandler("onboarding.complete", async () => {
    const { userId } = await requireSession()
    const body = (await req.json().catch(() => null)) as { interests?: unknown } | null
    const raw = Array.isArray(body?.interests) ? body!.interests : []
    const interests = raw.filter((t): t is string => typeof t === "string")
    if (interests.length > 24) throw new ValidationError("Too many interests selected.")

    await completeOnboarding(userId, interests)
    return NextResponse.json({ ok: true })
  })
}

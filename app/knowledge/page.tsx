import type { Metadata } from "next"
import { KnowledgeUnderstand } from "@/components/knowledge/understand/knowledge-understand"
import type { KnowledgeOverview } from "@/lib/knowledge/understand/types"
import { liveOverview } from "@/lib/knowledge/understand/live"
import { requireSession, StaleSessionError, UnauthenticatedError } from "@/lib/session"

export const metadata: Metadata = {
  title: "Keeply",
  description:
    "An interactive view of what your saved library actually contains — themes, concepts, connections and the questions they raise.",
}

/* Per-request by necessity: the headline counts below are one person's
 * own, and a statically prerendered page would freeze one tenant's
 * numbers into the build and serve them to everyone. */
export const dynamic = "force-dynamic"

/**
 * Resolves the viewer's real counts, or null when there is nobody to
 * resolve them for.
 *
 * Null is not a failure — it is the guest case, and the surface has a
 * correct answer for it: the labelled design prototype it has always
 * shown. Signing in is what turns the numbers into your own.
 */
async function overviewForViewer(): Promise<KnowledgeOverview | null> {
  let organizationId: string
  let userId: string
  try {
    ;({ organizationId, userId } = await requireSession())
  } catch (err) {
    // A stale session is a guest here for the same reason no session
    // is: /knowledge is outside middleware's auth matcher and has
    // always been readable signed out. Letting it 500 would take the
    // product's front door down over a cookie that simply expired.
    if (err instanceof UnauthenticatedError || err instanceof StaleSessionError) return null
    throw err
  }

  const counts = await liveOverview({ orgId: organizationId, userId })
  return {
    origin: "live",
    savedCount: counts.savedCount,
    conceptCount: counts.conceptCount,
    // Not measured anywhere in this codebase. Null rather than a
    // number, so the surface omits them instead of reporting a guess
    // as a finding — see lib/knowledge/understand/live.ts.
    themeCount: null,
    questionCount: null,
    since: counts.since === null ? null : new Date(counts.since).toISOString(),
  }
}

export default async function KnowledgePage() {
  return <KnowledgeUnderstand overview={await overviewForViewer()} />
}

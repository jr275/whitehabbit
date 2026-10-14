import type { Metadata } from "next"
import { getTranslations } from "@/lib/knowledge/i18n/server"
import { KnowledgeUnderstand } from "@/components/knowledge/understand/knowledge-understand"
import type { KnowledgeOverview } from "@/lib/knowledge/understand/types"
import { liveExplorer, liveOverview, type LiveExplorer } from "@/lib/knowledge/understand/live"
import { logger } from "@/lib/observability/logger"
import { requireSession, StaleSessionError, UnauthenticatedError } from "@/lib/session"

/* The tab, the bookmark and the share preview are read as often as
 * the page, so they come from the dictionary too. This page already
 * resolves the locale for its own content, so nothing here makes it
 * any more dynamic than it was. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return {
    title: t.meta.connectionsTitle,
    description: t.meta.connectionsDescription,
  }
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
interface ViewerData {
  overview: KnowledgeOverview | null
  explorer: LiveExplorer | null
  /** A real failure reading the library, which the Explorer renders as
   *  a failure. Never collapsed into "you have nothing saved". */
  explorerError: boolean
}

async function dataForViewer(): Promise<ViewerData> {
  let organizationId: string
  let userId: string
  try {
    ;({ organizationId, userId } = await requireSession())
  } catch (err) {
    // A stale session is a guest here for the same reason no session
    // is: /knowledge is outside middleware's auth matcher and has
    // always been readable signed out. Letting it 500 would take the
    // product's front door down over a cookie that simply expired.
    if (err instanceof UnauthenticatedError || err instanceof StaleSessionError) {
      return { overview: null, explorer: null, explorerError: false }
    }
    throw err
  }

  const scope = { orgId: organizationId, userId }

  // One failure must not take the other section down with it, and an
  // unreadable library must not render as an empty one.
  const [counts, explorer] = await Promise.all([
    liveOverview(scope),
    liveExplorer(scope).catch((err: unknown) => {
      logger.error("knowledge_explorer_load_failed", {
        message: err instanceof Error ? err.message : String(err),
      })
      return null
    }),
  ])

  return {
    overview: {
      origin: "live",
      savedCount: counts.savedCount,
      conceptCount: counts.conceptCount,
      // Not measured anywhere in this codebase. Null rather than a
      // number, so the surface omits them instead of reporting a guess
      // as a finding — see lib/knowledge/understand/live.ts.
      themeCount: null,
      questionCount: null,
      since: counts.since === null ? null : new Date(counts.since).toISOString(),
    },
    explorer,
    explorerError: explorer === null,
  }
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ concept?: string | string[] }>
}) {
  const [{ overview, explorer, explorerError }, params] = await Promise.all([dataForViewer(), searchParams])

  // The param selects among rows this scope already owns — it is never
  // itself authorization for anything, and a concept id that is not in
  // the viewer's own list simply matches nothing.
  const raw = Array.isArray(params.concept) ? params.concept[0] : params.concept
  const initialConceptId = raw && explorer?.concepts.some((c) => c.id === raw) ? raw : null

  return (
    <KnowledgeUnderstand
      overview={overview}
      explorer={explorer}
      explorerError={explorerError}
      initialConceptId={initialConceptId}
    />
  )
}

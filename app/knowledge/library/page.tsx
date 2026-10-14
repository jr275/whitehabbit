import { LibraryView } from "@/components/knowledge/library-view"
import { getTranslations } from "@/lib/knowledge/i18n/server"

/* The tab, the bookmark and the share preview are read as often as
 * the page, so they come from the dictionary too. This page already
 * resolves the locale for its own content, so nothing here makes it
 * any more dynamic than it was. */
export async function generateMetadata() {
  const { t } = await getTranslations()
  return {
    title: t.meta.libraryTitle,
  }
}

/* Reads ?q= per request, so a link to a filtered Library arrives
 * filtered rather than filtering itself a frame later. Nothing is
 * fetched here: the search runs client-side through the same API the
 * box uses, and this only decides what the box starts with. */
export const dynamic = "force-dynamic"

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.q) ? params.q[0] : params.q
  // Bounded: a query is a search term, not a payload. The search API
  // enforces its own limits too — this keeps an absurd URL from ever
  // reaching a state setter.
  return <LibraryView initialQuery={(raw ?? "").slice(0, 200)} />
}

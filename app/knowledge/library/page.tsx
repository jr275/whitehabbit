import { LibraryView } from "@/components/knowledge/library-view"

export const metadata = {
  title: "Library · Knowledge",
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

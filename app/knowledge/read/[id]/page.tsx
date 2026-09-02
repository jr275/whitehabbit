import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireSession, UnauthenticatedError } from "@/lib/session"
import { getItem, getTags, markRead } from "@/lib/knowledge/repo"
import { rowToDocument } from "@/lib/knowledge/adapter"
import { ReaderView } from "@/components/knowledge/reader-view"
import { GuestReader } from "@/components/knowledge/guest-reader"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    // S5: owner-scoped — another user's item never leaks its real
    // title into the page <title>, browser history or tab either.
    const { organizationId, userId } = await requireSession()
    const row = await getItem(id, organizationId, userId)
    return { title: row?.title ? `${row.title} · Knowledge` : "Reader · Knowledge" }
  } catch {
    return { title: "Reader · Knowledge" }
  }
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Guest-created items never exist server-side — read them client-side.
  if (id.startsWith("kn_guest_")) return <GuestReader id={id} />

  let organizationId: string
  let userId: string
  try {
    ;({ organizationId, userId } = await requireSession())
  } catch (err) {
    // No session → guest mode. Load through the browser-local store
    // instead of hard-failing.
    if (err instanceof UnauthenticatedError) return <GuestReader id={id} />
    throw err
  }

  // S5: another org member's item is a 404 here too — this page reads
  // the repo directly (not through the API route), so it needs the
  // exact same owner-scoped predicate, not a lesser check.
  const row = await getItem(id, organizationId, userId)
  if (!row) notFound()

  const tags = await getTags(id, organizationId, userId)
  const doc = rowToDocument(row, tags)

  // Reading it counts as reading it.
  if (!row.read_at) await markRead(id, organizationId, userId).catch(() => {})

  return <ReaderView doc={doc} />
}

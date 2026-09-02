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
    const { organizationId } = await requireSession()
    const row = await getItem(id, organizationId)
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
  try {
    ;({ organizationId } = await requireSession())
  } catch (err) {
    // No session → guest mode. Load through the browser-local store
    // instead of hard-failing.
    if (err instanceof UnauthenticatedError) return <GuestReader id={id} />
    throw err
  }

  const row = await getItem(id, organizationId)
  if (!row) notFound()

  const tags = await getTags(id, organizationId)
  const doc = rowToDocument(row, tags)

  // Reading it counts as reading it.
  if (!row.read_at) await markRead(id, organizationId).catch(() => {})

  return <ReaderView doc={doc} />
}

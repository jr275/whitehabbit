import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { requireSession } from "@/lib/session"
import { getItem, getTags, markRead } from "@/lib/knowledge/repo"
import { rowToDocument } from "@/lib/knowledge/adapter"
import { ReaderView } from "@/components/knowledge/reader-view"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { organizationId } = await requireSession()
  const row = await getItem(id, organizationId)
  return { title: row?.title ? `${row.title} · Knowledge` : "Reader · Knowledge" }
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { organizationId } = await requireSession()

  const row = await getItem(id, organizationId)
  if (!row) notFound()

  const tags = await getTags(id, organizationId)
  const doc = rowToDocument(row, tags)

  // Reading it counts as reading it.
  if (!row.read_at) await markRead(id, organizationId).catch(() => {})

  return <ReaderView doc={doc} />
}

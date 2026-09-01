import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getKnowledgeItems } from "@/lib/knowledge/demo-data"
import { ReaderView } from "@/components/knowledge/reader-view"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const item = getKnowledgeItems().find((i) => i.id === id)
  return {
    title: item ? `${item.title} · Knowledge` : "Reader · Knowledge",
  }
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = getKnowledgeItems().find((i) => i.id === id)
  if (!item) notFound()
  return <ReaderView item={item} />
}

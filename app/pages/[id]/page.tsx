import { PageDetail } from "@/components/pages/page-detail"

export default async function PageDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PageDetail id={id} />
}

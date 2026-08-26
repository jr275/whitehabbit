import { WebsiteDetail } from "@/components/websites/website-detail"

export default async function WebsiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WebsiteDetail id={id} />
}

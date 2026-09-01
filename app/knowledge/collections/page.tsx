import { FolderOpen } from "lucide-react"
import { ComingSoon } from "@/components/knowledge/coming-soon"

export const metadata = { title: "Collections · Knowledge" }

export default function CollectionsPage() {
  return (
    <ComingSoon
      eyebrow="Collections"
      title="Group what belongs together."
      description="Curated sets of saved pieces, organized around a project, question or theme."
      icon={FolderOpen}
      bullets={[
        "Create collections and drag saved items into them",
        "Auto-suggested groupings based on shared topics",
        "Share a collection as a read-only reading list",
      ]}
    />
  )
}

import { FolderOpen } from "lucide-react"
import { ComingSoon } from "@/components/knowledge/coming-soon"

export const metadata = { title: "Collections · Knowledge" }

export default function CollectionsPage() {
  return (
    <ComingSoon
      eyebrow="Collections"
      title="How you choose to organize."
      description="Topics surface automatically from what you save — Collections are the sets you build on purpose, around a project, question or theme."
      icon={FolderOpen}
      bullets={[
        "Create collections and drag saved items into them",
        "Keep them separate from the topics Keeply detects for you",
        "Share a collection as a read-only reading list",
      ]}
    />
  )
}

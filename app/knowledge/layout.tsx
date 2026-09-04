import type { Metadata } from "next"
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell"

export const metadata: Metadata = {
  title: "Keeply",
  description:
    "Your personal knowledge library. Save anything worth remembering and let Keeply understand, organize and connect it for you.",
}

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <KnowledgeShell>{children}</KnowledgeShell>
}

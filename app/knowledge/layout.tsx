import type { Metadata } from "next"
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell"

export const metadata: Metadata = {
  title: "Knowledge — Whitehabbit",
  description:
    "Your personal knowledge library. Save anything worth remembering and let the system understand, organize and connect it for you.",
}

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <KnowledgeShell>{children}</KnowledgeShell>
}

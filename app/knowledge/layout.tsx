import type { Metadata } from "next"
import { cookies } from "next/headers"
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell"
import { KN_THEME_COOKIE, parseKnowledgeTheme } from "@/lib/knowledge/theme"

export const metadata: Metadata = {
  title: "Keeply",
  description:
    "Your personal knowledge library. Save anything worth remembering and let Keeply understand, organize and connect it for you.",
}

export default async function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  const theme = parseKnowledgeTheme((await cookies()).get(KN_THEME_COOKIE)?.value)
  return <KnowledgeShell initialTheme={theme}>{children}</KnowledgeShell>
}

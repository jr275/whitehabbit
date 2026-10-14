import type { Metadata } from "next"
import { cookies } from "next/headers"
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell"
import { KN_THEME_COOKIE, parseKnowledgeTheme } from "@/lib/knowledge/theme"
import { getLocale, getTranslations } from "@/lib/knowledge/i18n/server"

/* The tab, the bookmark and the share preview are read as often as
 * the page, so they come from the dictionary too. This page already
 * resolves the locale for its own content, so nothing here makes it
 * any more dynamic than it was. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return {
    title: t.meta.appTitle,
    description: t.meta.appDescription,
  }
}

export default async function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  const theme = parseKnowledgeTheme((await cookies()).get(KN_THEME_COOKIE)?.value)
  /* Both the theme and the language are resolved HERE so the first
   * paint is already the reader's — a language chosen on the client
   * renders English and then repaints. getLocale() is the one resolver
   * server pages share, so a page and its chrome can never disagree. */
  const locale = await getLocale()

  return (
    <KnowledgeShell initialTheme={theme} initialLocale={locale}>
      {children}
    </KnowledgeShell>
  )
}

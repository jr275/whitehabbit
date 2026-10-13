import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell"
import { KN_THEME_COOKIE, parseKnowledgeTheme } from "@/lib/knowledge/theme"
import { KN_LOCALE_COOKIE, resolveLocale } from "@/lib/knowledge/i18n/locale"

export const metadata: Metadata = {
  title: "Keeply",
  description:
    "Your personal knowledge library. Save anything worth remembering and let Keeply understand, organize and connect it for you.",
}

export default async function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const theme = parseKnowledgeTheme(jar.get(KN_THEME_COOKIE)?.value)
  /* Both the theme and the language are resolved HERE so the first
   * paint is already the reader's — a language chosen on the client
   * renders English and then repaints. With no stored choice, the
   * browser's own Accept-Language decides; see lib/knowledge/i18n. */
  const locale = resolveLocale(jar.get(KN_LOCALE_COOKIE)?.value, (await headers()).get("accept-language"))

  return (
    <KnowledgeShell initialTheme={theme} initialLocale={locale}>
      {children}
    </KnowledgeShell>
  )
}

import { KnowledgeHome } from "@/components/knowledge/knowledge-home"
import { getTranslations } from "@/lib/knowledge/i18n/server"

/* The tab, the bookmark and the share preview are read as often as
 * the page, so they come from the dictionary too. This page already
 * resolves the locale for its own content, so nothing here makes it
 * any more dynamic than it was. */
export async function generateMetadata() {
  const { t } = await getTranslations()
  return {
    title: t.meta.homeTitle,
    description: t.meta.homeDescription,
  }
}

/* The original library home, which used to be /knowledge. It is a real,
 * API-wired surface (useKnowledgeLibrary) and was moved rather than
 * removed when /knowledge became the Understand experience. */
export default function KnowledgeLibraryHomePage() {
  return <KnowledgeHome />
}

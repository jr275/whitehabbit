import { SettingsView } from "@/components/knowledge/settings-view"
import { getTranslations } from "@/lib/knowledge/i18n/server"

/* The tab, the bookmark and the share preview are read as often as
 * the page, so they come from the dictionary too. This page already
 * resolves the locale for its own content, so nothing here makes it
 * any more dynamic than it was. */
export async function generateMetadata() {
  const { t } = await getTranslations()
  return {
    title: t.meta.settingsTitle,
    description: t.meta.settingsDescription,
  }
}

export default function KnowledgeSettingsPage() {
  return <SettingsView />
}

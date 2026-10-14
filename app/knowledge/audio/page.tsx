import { Headphones } from "lucide-react"
import { ComingSoon } from "@/components/knowledge/coming-soon"
import { getTranslations } from "@/lib/knowledge/i18n/server"

/* The tab, the bookmark and the share preview are read as often as
 * the page, so they come from the dictionary too. This page already
 * resolves the locale for its own content, so nothing here makes it
 * any more dynamic than it was. */
export async function generateMetadata() {
  const { t } = await getTranslations()
  return {
    title: t.meta.listenTitle,
    description: t.meta.listenDescription,
  }
}

export default async function AudioPage() {
  const { t } = await getTranslations()
  return (
    <ComingSoon
      eyebrow={t.comingSoon.audioEyebrow}
      title={t.comingSoon.audioTitle}
      description={t.comingSoon.audioBody}
      icon={Headphones}
      bullets={t.comingSoon.audioBullets}
    />
  )
}

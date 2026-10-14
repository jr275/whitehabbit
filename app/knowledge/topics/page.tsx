import Link from "next/link"
import { requireSession, UnauthenticatedError } from "@/lib/session"
import { listTagCounts } from "@/lib/knowledge/repo"
import { tagsToTopics } from "@/lib/knowledge/adapter"
import { askAboutHref, topicItemsHref } from "@/lib/knowledge/config"
import { GuestTopics } from "@/components/knowledge/guest-topics"
import { getTranslations } from "@/lib/knowledge/i18n/server"

/* The tab, the bookmark and the share preview are read as often as
 * the page, so they come from the dictionary too. This page already
 * resolves the locale for its own content, so nothing here makes it
 * any more dynamic than it was. */
export async function generateMetadata() {
  const { t } = await getTranslations()
  return {
    title: t.meta.topicsTitle,
  }
}

export default async function TopicsPage() {
  /* A Server Component reads the request directly — there is no client
   * context up here. One resolver, shared with the layout, so the page
   * and its chrome cannot end up in different languages. */
  const { t, locale } = await getTranslations()
  let organizationId: string
  let userId: string
  try {
    ;({ organizationId, userId } = await requireSession())
  } catch (err) {
    // No session → derive topics client-side from the guest library.
    if (err instanceof UnauthenticatedError) return <GuestTopics />
    throw err
  }

  // S5: topics are derived from THIS user's own saved items only —
  // never an org-wide aggregate that would leak a colleague's tags.
  const counts = await listTagCounts(organizationId, userId)
  const topics = tagsToTopics(counts).sort((a, b) => b.count - a.count)
  const max = topics.reduce((m, topic) => Math.max(m, topic.count), 1)

  return (
    <div className="pk-page pb-24">
      <header className="pt-14 sm:pt-20">
        <p className="pk-label">{t.topicsPage.eyebrow}</p>
        <h1 className="pk-display mt-4 max-w-[18ch] text-[var(--pk-ink)]">{t.topicsPage.title}</h1>
        <p className="pk-meta mt-5 max-w-[52ch]">
          {t.topicsPage.surfaced(topics.length, topics.length.toLocaleString(locale))}
        </p>
      </header>

      {topics.length === 0 ? (
        <div className="max-w-[46ch] py-16">
          <p className="text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)]">{t.topicsPage.emptyTitle}</p>
          <p className="mt-2 text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">
            {t.topicsPage.emptyBody}
          </p>
        </div>
      ) : (
        /* A topic is a word, a weight and two things you can do with
           it. It used to be a card with a progress bar; with one piece
           per topic every bar was full, so the loudest mark on the page
           encoded nothing. The bar is now a hairline whose width is the
           topic's share of the largest one, drawn UNDER the row rather
           than inside a box — present when it means something, silent
           when it does not. */
        <ul className="pk-rows mt-10">
          {topics.map((topic) => (
            <li key={topic.id} className="pk-row group">
              <div className="flex items-baseline justify-between gap-6">
                <Link
                  href={topicItemsHref(topic.label)}
                  className="min-w-0 flex-1 truncate text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)]"
                >
                  {topic.label}
                </Link>
                <Link
                  href={askAboutHref(t.topicsPage.askQuestion(topic.label))}
                  className="pk-meta shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  {t.topicsPage.askAboutThis}
                </Link>
                <span className="pk-meta pk-num w-20 shrink-0 text-right">
                  {t.topicsPage.pieces(topic.count, topic.count.toLocaleString(locale))}
                </span>
              </div>
              <div aria-hidden className="mt-3 h-px w-full bg-[var(--pk-rule)]">
                <div className="h-px bg-[var(--pk-ink-4)]" style={{ width: `${(topic.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { PageContainer, PageHeader } from "@/components/knowledge/page-header"
import { requireSession, UnauthenticatedError } from "@/lib/session"
import { listTagCounts } from "@/lib/knowledge/repo"
import { tagsToTopics } from "@/lib/knowledge/adapter"
import { askAboutHref } from "@/lib/knowledge/config"
import { GuestTopics } from "@/components/knowledge/guest-topics"

export const metadata = {
  title: "Topics · Knowledge",
}

export default async function TopicsPage() {
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
  const max = topics.reduce((m, t) => Math.max(m, t.count), 1)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Topics"
        title="The themes running through your library."
        subtitle="Topics surface automatically from what you save. Larger means stronger presence."
      />

      {topics.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-16 text-center">
          <p className="text-sm text-foreground">No topics yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Save a few things and topics will start to appear here.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-2xl font-medium tracking-tight text-foreground">{t.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t.count} {t.count === 1 ? "piece" : "pieces"}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-[var(--kn-ai)]/70"
                  style={{ width: `${(t.count / max) * 100}%` }}
                />
              </div>
              <Link
                href={askAboutHref(`What have I saved about ${t.label}?`)}
                className="inline-flex items-center gap-1.5 rounded text-[12.5px] font-medium text-[var(--kn-ai)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kn-paper)]"
              >
                <Sparkles className="size-3.5" /> Ask about this topic
              </Link>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}

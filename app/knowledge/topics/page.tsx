import { PageContainer, PageHeader } from "@/components/knowledge/page-header"
import { getTopics } from "@/lib/knowledge/demo-data"
import { TrendingUp } from "lucide-react"

export default function TopicsPage() {
  const topics = [...getTopics()].sort((a, b) => b.count - a.count)
  const max = Math.max(...topics.map((t) => t.count))

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Topics"
        title="The themes running through your library."
        subtitle="Topics surface automatically from what you save. Larger means stronger presence."
      />

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((t) => (
          <button
            key={t.id}
            className="group flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-5 text-left transition-all hover:border-foreground/20"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-2xl font-medium tracking-tight text-foreground">
                {t.label}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{t.count} pieces</span>
            </div>
            {/* presence bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[var(--kn-ai)]/70"
                style={{ width: `${(t.count / max) * 100}%` }}
              />
            </div>
            {t.momentum > 0.6 && (
              <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-grow">
                <TrendingUp className="size-3" /> Trending up
              </span>
            )}
          </button>
        ))}
      </div>
    </PageContainer>
  )
}

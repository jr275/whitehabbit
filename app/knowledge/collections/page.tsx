import { CollectionCard } from "@/components/knowledge/intelligence"
import { PageContainer, PageHeader } from "@/components/knowledge/page-header"
import { getCollections } from "@/lib/knowledge/demo-data"
import { Sparkles } from "lucide-react"

export default function CollectionsPage() {
  const collections = getCollections()
  const auto = collections.filter((c) => c.auto)
  const manual = collections.filter((c) => !c.auto)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Collections"
        title="Everything, grouped by meaning."
        subtitle="Collections are assembled automatically as you save — and you can shape your own."
      />

      <section className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--kn-ai)]">
          <Sparkles className="size-3.5" /> Organized for you
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {auto.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Your collections
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {manual.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      </section>
    </PageContainer>
  )
}

import { KnowledgeCard } from "@/components/knowledge/knowledge-card"
import { PageContainer, PageHeader } from "@/components/knowledge/page-header"
import { getKnowledgeItems } from "@/lib/knowledge/demo-data"

export default function FavoritesPage() {
  const favorites = getKnowledgeItems().filter((i) => i.favorite)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Favorites"
        title="The ones you keep coming back to."
        subtitle="Everything you've marked worth remembering twice."
      />

      <div className="mt-10 kn-masonry">
        {favorites.map((item, i) => (
          <KnowledgeCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </PageContainer>
  )
}

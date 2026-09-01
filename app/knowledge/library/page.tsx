import { LibraryView } from "@/components/knowledge/library-view"
import {
  getCollections,
  getInsights,
  getKnowledgeItems,
  getSavedThisWeek,
  getTopics,
} from "@/lib/knowledge/demo-data"

export default function LibraryPage() {
  return (
    <LibraryView
      items={getKnowledgeItems()}
      collections={getCollections()}
      topics={getTopics()}
      insights={getInsights()}
      savedThisWeek={getSavedThisWeek()}
    />
  )
}

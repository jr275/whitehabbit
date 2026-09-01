import { LibraryView } from "@/components/knowledge/library-view"

export const metadata = {
  title: "Favorites · Knowledge",
}

export default function FavoritesPage() {
  return (
    <LibraryView
      lockedFilter="favorites"
      eyebrow="Favorites"
      title="The ones you keep coming back to."
      subtitle="Everything you've marked worth remembering twice."
    />
  )
}

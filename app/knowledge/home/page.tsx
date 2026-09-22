import { KnowledgeHome } from "@/components/knowledge/knowledge-home"

export const metadata = {
  title: "Home · Keeply",
  description: "Your personal knowledge library — pick up where you left off, or save something new.",
}

/* The original library home, which used to be /knowledge. It is a real,
 * API-wired surface (useKnowledgeLibrary) and was moved rather than
 * removed when /knowledge became the Understand experience. */
export default function KnowledgeLibraryHomePage() {
  return <KnowledgeHome />
}

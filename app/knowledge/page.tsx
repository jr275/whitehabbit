import { KnowledgeUnderstand } from "@/components/knowledge/understand/knowledge-understand"

export const metadata = {
  title: "Keeply",
  description:
    "An interactive view of what your saved library actually contains — themes, concepts, connections and the questions they raise.",
}

/* This surface reads no per-request data today (see lib/knowledge/
 * understand/hooks.ts — the adapter boundary resolves fixed sample
 * data). It is left dynamic anyway because those hooks are the seam a
 * real, session-scoped query goes through next, and a statically
 * prerendered page would freeze one tenant's numbers into the build. */
export const dynamic = "force-dynamic"

export default function KnowledgePage() {
  return <KnowledgeUnderstand />
}

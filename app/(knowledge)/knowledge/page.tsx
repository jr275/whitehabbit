/* /knowledge — the Knowledge Library.
 *
 * NOT /library: that route belongs to the Workforce product's worker
 * library and is untouched. The UI label says "Library"; the technical
 * route is /knowledge. */

import { redirect } from "next/navigation"
import { requireScope } from "@/lib/knowledge/access/scope"
import { KnowledgeLibrary } from "@/components/knowledge/library"

export const dynamic = "force-dynamic"

export default async function KnowledgePage() {
  try {
    await requireScope()
  } catch {
    redirect("/login?callbackUrl=/knowledge")
  }
  return <KnowledgeLibrary />
}

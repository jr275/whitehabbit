"use client"

/* The only reason this wrapper exists: "your library is empty" is a
 * claim about the user's data, so it has to be read from the API
 * rather than inferred from an empty answer. Until that read
 * completes the input stays enabled and no state is asserted —
 * guessing "empty" for a moment would flash a wrong claim at someone
 * with a full library. */

import { useKnowledgeLibrary } from "@/lib/knowledge/use-knowledge"
import { AskView } from "./ask-view"

export function AskPage() {
  const { status, total } = useKnowledgeLibrary({ pageSize: 1 })
  return <AskView libraryIsEmpty={status === "ready" && total === 0} />
}

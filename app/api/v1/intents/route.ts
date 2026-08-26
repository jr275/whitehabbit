import "server-only"

/* GET /api/v1/intents — the real, closed intent taxonomy (§17). A
 * lookup, not a tenant-scoped resource — every project uses the same
 * taxonomy regardless of vertical. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { requireSession } from "@/lib/session"

const INTENT_TAXONOMY = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
  "local",
  "comparison",
  "problem",
  "how_to",
  "definition",
  "research",
  "investment",
] as const

export async function GET() {
  return withApiHandler("v1.intents.list", async () => {
    await requireSession() // real auth check even for a static lookup — never an unauthenticated read of internal taxonomy
    return NextResponse.json({ intents: INTENT_TAXONOMY })
  })
}

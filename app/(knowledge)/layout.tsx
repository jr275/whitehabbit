/* ================================================================== *
 * KNOWLEDGE LAYOUT
 *
 * A nested layout for the /knowledge subtree. The root layout
 * (app/layout.tsx) hard-codes Workforce branding and colorScheme:
 * 'dark'; it belongs to the Workforce product and is NOT modified.
 * This overrides metadata for the Knowledge subtree only.
 *
 * The "(knowledge)" route group affects file organisation only — it
 * does not appear in the URL. The route really is /knowledge, because
 * /library is the Workforce worker library and must not be touched.
 * ================================================================== */

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Library",
  description: "Save anything from the internet and find it again.",
}

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>
}

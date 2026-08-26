/* ================================================================== *
 * JSON-LD ENGINE (§24) — generates real structured data from actual
 * page/entity data. WebPage + BreadcrumbList always; Organization only
 * when the page's primary entity actually is one. Every property here
 * traces to a real field — nothing is fabricated to look complete.
 * Validated (shape-checked) before publication by validateJsonLd().
 * ================================================================== */

import type { Entity } from "@/lib/knowledge/model"
import type { Page, PageContent } from "./model"

export function buildJsonLd(page: Page, content: PageContent, canonicalUrl: string, primaryEntity: Entity | null): Record<string, unknown>[] {
  const graph: Record<string, unknown>[] = []

  graph.push({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: content.title,
    description: content.metaDescription,
    url: canonicalUrl,
  })

  graph.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: content.title, item: canonicalUrl }],
  })

  if (primaryEntity && primaryEntity.entityType === "Organization") {
    graph.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: primaryEntity.name,
    })
  }

  return graph
}

/** Real structural validation — every block must at least have
 * @context/@type and not be empty. Never publishes fabricated or
 * malformed structured data (§24: "Validate generated JSON-LD."). */
export function validateJsonLd(blocks: unknown[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (blocks.length === 0) errors.push("No JSON-LD blocks were generated.")
  for (const [i, block] of blocks.entries()) {
    if (!block || typeof block !== "object") {
      errors.push(`Block ${i} is not an object.`)
      continue
    }
    const b = block as Record<string, unknown>
    if (b["@context"] !== "https://schema.org") errors.push(`Block ${i} is missing a valid @context.`)
    if (typeof b["@type"] !== "string" || !b["@type"]) errors.push(`Block ${i} is missing @type.`)
  }
  return { valid: errors.length === 0, errors }
}

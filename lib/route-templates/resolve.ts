/* ================================================================== *
 * ROUTE TEMPLATE RESOLUTION (§19) — vertical-agnostic by construction:
 * matching is driven entirely by each template's own declared
 * intentBindings, never by a switch/if-chain over vertical names. A
 * real-estate project's templates and a SaaS project's templates are
 * resolved through the exact same function.
 * ================================================================== */

import type { RouteTemplate } from "./model"

export interface RouteTemplateMatchInput {
  targetIntent: string | null
  opportunityType: string | null
}

/** Highest-priority active template whose intentBindings list is empty
 * (matches anything) or contains the opportunity's intent/type — or
 * null if none match. Never guesses a template for an opportunity that
 * doesn't declare a compatible intent (§19 — no vertical-specific
 * fallback logic). */
export function resolveRouteTemplate(templates: RouteTemplate[], input: RouteTemplateMatchInput): RouteTemplate | null {
  const candidates = templates.filter((t) => {
    if (t.intentBindings.length === 0) return true
    return (input.targetIntent && t.intentBindings.includes(input.targetIntent)) || (input.opportunityType && t.intentBindings.includes(input.opportunityType))
  })
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => b.priority - a.priority)[0]
}

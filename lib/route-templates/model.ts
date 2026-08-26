/* ================================================================== *
 * ROUTE TEMPLATES (§19, ADR-016 amendment) — a real, vertical-agnostic
 * pattern registry. A template's `pattern` (e.g. "/{city}/{propertyType}/
 * {intent}") and its entity/intent/market bindings describe how a page
 * SHOULD be classified and addressed, without any vertical-specific
 * code: the same engine binds a real-estate template's {city} segment
 * and a SaaS template's {integration} segment identically, because
 * both are just named bindings resolved against the opportunity's
 * primary entity attributes.
 *
 * Binding today is classification, not routing (see ADR-016): a page
 * created against a template records which template it matched
 * (pages.route_template_id) for reporting/consistency, but public URL
 * resolution still goes through the existing, simpler (projectId, slug)
 * path (lib/pages/repo.ts's resolvePublishedPage) — swapping the public
 * resolver to render FROM a template's pattern is real future work
 * (tracked honestly as PLANNED, not claimed here).
 * ================================================================== */

export type RouteTemplateStatus = "draft" | "active" | "archived"

export interface RouteTemplateBinding {
  segment: string
  entityType?: string
}

export interface RouteTemplate {
  id: string
  orgId: string
  projectId: string
  name: string
  pattern: string
  version: number
  status: RouteTemplateStatus
  entityBindings: RouteTemplateBinding[]
  intentBindings: string[]
  marketBindings: string[]
  requirements: string[]
  priority: number
  createdAt: number
  updatedAt: number
}

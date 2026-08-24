/* ================================================================== *
 * PRODUCT CATALOG — the commercial layer ABOVE the Workforce OS.
 *
 *   PRODUCT -> WORKER -> SKILLS -> TOOLS
 *
 * A Product is a customer-facing business system (Content
 * Intelligence, Programmatic SEO, Discover) — NOT a Skill, and NOT
 * itself a Worker. It is a template for provisioning one: which real
 * Skills (lib/workforce/catalog.ts — the capability layer, unchanged)
 * the resulting Worker uses, and what onboarding questions build that
 * Worker's Domain Profile — the real, customer-specific business/
 * audience/data/process/rules text that makes two customers of the
 * same Product behave differently (see lib/products/domain-profile.ts
 * and lib/workforce/seed.ts's buildWorkerFromProduct()).
 *
 * Multiple Products deliberately reuse the SAME underlying Skill
 * (Content Intelligence and Discover both use skill_trend_research) —
 * that's the point: the capability layer is shared, the product layer
 * is what differentiates them, via onboarding + Domain Profile +
 * mission framing, never via forked skill code.
 * ================================================================== */

export type ProductProfileBucket = "business" | "audience" | "data" | "process" | "rules"

export const PROFILE_BUCKET_LABEL: Record<ProductProfileBucket, string> = {
  business: "Business",
  audience: "Audience",
  data: "Data & channels",
  process: "Process",
  rules: "Rules & constraints",
}

export interface ProductOnboardingField {
  key: string
  bucket: ProductProfileBucket
  label: string
  type: "text" | "textarea"
  required: boolean
  placeholder: string
}

export interface ProductTemplate {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  /** the product's OWN visual identity — deliberately a separate
   * system from the skill-category identity in
   * lib/workforce/visual-identity.ts. Two products can share a
   * primary skill (and thus a skill-category color) while still
   * looking completely distinct as products. */
  accent: string
  icon: "PenLine" | "Layers" | "Compass"
  deliverableLabel: string
  workerRoleLabel: string
  primarySkillId: string
  secondarySkillIds: string[]
  onboarding: ProductOnboardingField[]
  /** Honest capability disclosure — section "REALITY VS DEMO". Shown
   * directly on the product's page, never silently assumed. */
  realCapabilities: string[]
  notYetConnected: string[]
}

export const PRODUCT_CATALOG: ProductTemplate[] = [
  {
    id: "product_content_intelligence",
    slug: "content-intelligence",
    name: "Content Intelligence",
    tagline: "Know what to write, for this business specifically.",
    description:
      "A Worker that researches real content and market signals through the lens of your actual business, audience and brand rules — not a generic content-ideas generator.",
    accent: "#a855f7",
    icon: "PenLine",
    deliverableLabel: "Content opportunity briefs, grounded in real sources",
    workerRoleLabel: "Content Intelligence Worker",
    primarySkillId: "skill_trend_research",
    secondarySkillIds: ["skill_content_intelligence"],
    onboarding: [
      { key: "business", bucket: "business", label: "What does your business do?", type: "textarea", required: true, placeholder: "We run a 40-room boutique hotel in Lisbon focused on business travellers." },
      { key: "audience", bucket: "audience", label: "Who is the content for?", type: "textarea", required: true, placeholder: "Corporate travel bookers and business guests researching where to stay." },
      { key: "data", bucket: "data", label: "What do you currently publish, and where?", type: "textarea", required: false, placeholder: "A blog on our site, plus Instagram — mostly property photos today." },
      { key: "process", bucket: "process", label: "How do you currently decide what to write about?", type: "textarea", required: false, placeholder: "Ad hoc — whatever the GM thinks of that month." },
      { key: "rules", bucket: "rules", label: "Brand voice or topics to avoid?", type: "textarea", required: false, placeholder: "Warm but professional. Never discount pricing directly in content." },
    ],
    realCapabilities: [
      "Real web-search-grounded content/topic research (Trend Research skill), framed by your real business + audience",
      "Structured, source-cited opportunity output — never a fabricated trend",
    ],
    notYetConnected: ["Google Search Console", "Analytics/CMS performance data (Content Intelligence secondary skill stays honestly blocked until one is connected)", "Auto-publish to a CMS"],
  },
  {
    id: "product_programmatic_seo",
    slug: "programmatic-seo",
    name: "Programmatic SEO",
    tagline: "Real page opportunities, planned for your actual site.",
    description:
      "A Worker that turns real topic signals into structured, source-cited page plans — scoped to your real site, existing pages and publishing constraints.",
    accent: "#f59e0b",
    icon: "Layers",
    deliverableLabel: "Page-opportunity plans with title, intent and outline",
    workerRoleLabel: "Programmatic SEO Worker",
    primarySkillId: "skill_seo_opportunity",
    secondarySkillIds: ["skill_trend_research"],
    onboarding: [
      { key: "business", bucket: "business", label: "What does your site/business do?", type: "textarea", required: true, placeholder: "We're a project-management SaaS tool for small agencies." },
      { key: "audience", bucket: "audience", label: "Who searches for pages like this?", type: "textarea", required: true, placeholder: "Agency owners comparing PM tools, and freelancers searching how-to guides." },
      { key: "data", bucket: "data", label: "What pages/sections does your site already have?", type: "textarea", required: false, placeholder: "A features page, a pricing page, and 12 blog posts." },
      { key: "process", bucket: "process", label: "How do new pages currently get published?", type: "textarea", required: false, placeholder: "Marketing writes a doc, engineering ships it as a Next.js page." },
      { key: "rules", bucket: "rules", label: "Any topics, competitors or page types to avoid?", type: "textarea", required: false, placeholder: "Never name competitors directly in a page title." },
    ],
    realCapabilities: [
      "Real web-search-grounded opportunity discovery (SEO Opportunity Planning skill)",
      "Structured page plans (title, search intent, outline) — never fabricated keyword-volume numbers",
    ],
    notYetConnected: ["Google Search Console (real keyword/impression data)", "Rank tracking", "Bulk CMS publish"],
  },
  {
    id: "product_discover",
    slug: "discover",
    name: "Discover",
    tagline: "Real signals about your market, not a generic dashboard.",
    description:
      "A Worker that surfaces genuine market and opportunity signals — trends, and if relevant, real qualified leads — filtered through your real industry, audience and rules.",
    accent: "#14b8a6",
    icon: "Compass",
    deliverableLabel: "Market/opportunity signal reports, grounded in real sources",
    workerRoleLabel: "Discover Worker",
    primarySkillId: "skill_trend_research",
    secondarySkillIds: ["skill_lead_qualification"],
    onboarding: [
      { key: "business", bucket: "business", label: "What industry/market are you in?", type: "textarea", required: true, placeholder: "Regional airline operating short-haul routes in Southern Europe." },
      { key: "audience", bucket: "audience", label: "Whose behavior/decisions matter to you?", type: "textarea", required: true, placeholder: "Leisure travellers booking 2-8 weeks out, and corporate travel managers." },
      { key: "data", bucket: "data", label: "What signals matter most — competitors, pricing, demand, something else?", type: "textarea", required: false, placeholder: "Competitor route/pricing moves and seasonal demand signals." },
      { key: "process", bucket: "process", label: "How do you currently track market changes?", type: "textarea", required: false, placeholder: "Manually — someone checks competitor sites weekly." },
      { key: "rules", bucket: "rules", label: "Anything Discover should never report on, or should flag for human review?", type: "textarea", required: false, placeholder: "Never make pricing recommendations — flag pricing signals for review instead." },
    ],
    realCapabilities: [
      "Real web-search-grounded market/trend signal discovery (Trend Research skill), framed by your real market + audience",
      "Real, source-cited candidate/lead discovery when the signal is about companies, not just trends (Lead Qualification skill)",
    ],
    notYetConnected: ["Google Trends", "X/Twitter firehose", "CRM sync"],
  },
]

export function getProduct(id: string): ProductTemplate | undefined {
  return PRODUCT_CATALOG.find((p) => p.id === id)
}

export function getProductBySlug(slug: string): ProductTemplate | undefined {
  return PRODUCT_CATALOG.find((p) => p.slug === slug)
}

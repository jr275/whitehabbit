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
 * Products are free to share an underlying Skill when their real
 * capability genuinely is the same one — the capability layer stays
 * shared, the product layer differentiates via onboarding + Domain
 * Profile + mission framing, never via forked skill code. They are
 * equally free to need a genuinely distinct Skill (Discover's real
 * work — responding to a customer request — is not the same
 * capability as researching a topic, so it has its own).
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
      "AI content intelligence workforce specialized in discovering trends, identifying content opportunities and producing high-performing content.",
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
      "AI SEO workforce specialized in discovering entities, search opportunities and scalable programmatic page opportunities.",
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
    tagline: "Understands your customer, in your real context.",
    description:
      "AI customer operations workforce specialized in understanding conversations, using context and taking actions.",
    accent: "#14b8a6",
    icon: "Compass",
    deliverableLabel: "A real, grounded response to a customer request, plus a real handling decision",
    workerRoleLabel: "Discover Worker",
    primarySkillId: "skill_customer_conversation",
    secondarySkillIds: [],
    onboarding: [
      { key: "business", bucket: "business", label: "What does your business do?", type: "textarea", required: true, placeholder: "We run a 40-room boutique hotel in Lisbon focused on business travellers." },
      { key: "audience", bucket: "audience", label: "Who are your customers?", type: "textarea", required: true, placeholder: "Corporate travellers and leisure guests booking directly or via OTAs." },
      { key: "data", bucket: "data", label: "What kind of requests/conversations do customers bring you?", type: "textarea", required: false, placeholder: "Booking changes, cancellations, amenity questions, complaints." },
      { key: "process", bucket: "process", label: "How do you currently handle these requests?", type: "textarea", required: false, placeholder: "Front desk answers by phone/email; a manager handles complaints." },
      { key: "rules", bucket: "rules", label: "Anything that should always be escalated to a human, or flagged for review?", type: "textarea", required: false, placeholder: "Always escalate refund requests over €200. Never promise a specific room." },
    ],
    realCapabilities: [
      "Real, LLM-grounded responses to a real customer request, using this worker's real Domain Profile and rules (Customer Conversation skill)",
      "A real, honest handling decision per request — answered / escalated / flagged for review — never a fabricated external action",
    ],
    notYetConnected: ["Live chat/email/voice channel connection", "CRM sync", "Actually executing an action (booking change, refund) in an external system"],
  },
]

export function getProduct(id: string): ProductTemplate | undefined {
  return PRODUCT_CATALOG.find((p) => p.id === id)
}

export function getProductBySlug(slug: string): ProductTemplate | undefined {
  return PRODUCT_CATALOG.find((p) => p.slug === slug)
}

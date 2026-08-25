/* ================================================================== *
 * PRODUCT CATALOG — the commercial layer ABOVE the Workforce OS.
 *
 *   SUPER AGENT (Product) -> WORKER -> SKILLS -> TOOLS
 *
 * A Product is what the product experience calls a "Super Agent": a
 * business-domain specialist (Sales, Marketing, Customer Success...),
 * NOT a Skill, and NOT itself a Worker. It is a template for
 * provisioning one real Worker: which real Skills (lib/workforce/
 * catalog.ts — the capability layer, unchanged) the resulting Worker
 * uses, and what onboarding questions build that Worker's Domain
 * Profile — the real, customer-specific business/audience/data/
 * process/rules text that makes two customers of the same Super Agent
 * behave differently (see lib/products/domain-profile.ts and
 * lib/workforce/seed.ts's buildWorkerFromProduct()).
 *
 * status: "available" | "coming_soon" — the same honest pattern
 * established for disabled Connectors (lib/connectors/registry.ts):
 * a coming_soon Super Agent is listed so the full vision is visible,
 * but has no primarySkillId/onboarding and can never be provisioned —
 * there is no real Skill behind it yet, and this catalog never
 * pretends otherwise. Only the domains with a genuinely working Skill
 * are "available".
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

/** One business outcome a Super Agent's dashboard tracks. `real: true`
 * means it's actually computable today from real execution/skill data
 * (lib/workforce/business-outcome.ts) — `real: false` means it needs
 * a real data connection (CRM, analytics, ads) that doesn't exist yet
 * and the UI must say so, never estimate it silently. */
export interface BusinessOutcomeDef {
  label: string
  real: boolean
  /** Shown in place of a value when real: false. */
  connectHint?: string
}

export type ProductIcon = "PenLine" | "Layers" | "Compass" | "TrendingUp" | "Wallet" | "Settings" | "Users" | "ShoppingCart" | "Rocket"

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
  icon: ProductIcon
  status: "available" | "coming_soon"
  /** "Who it is" — one sentence, the specialist's own voice. */
  whoItIs: string
  /** "What it does autonomously" — the real, ordered action sequence
   * shown on the landing experience (section 11). Only ever lists
   * actions a real Skill of this Super Agent actually performs today
   * — never a step that isn't backed by working code. */
  autonomousActions: string[]
  businessOutcomes: BusinessOutcomeDef[]
  deliverableLabel: string
  workerRoleLabel: string
  /** undefined for a coming_soon Super Agent — there is nothing to
   * provision yet. */
  primarySkillId?: string
  secondarySkillIds: string[]
  onboarding: ProductOnboardingField[]
  /** Honest capability disclosure — section "REALITY VS DEMO". Shown
   * directly on the product's page, never silently assumed. */
  realCapabilities: string[]
  notYetConnected: string[]
}

export const PRODUCT_CATALOG: ProductTemplate[] = [
  {
    id: "product_sales",
    slug: "sales",
    name: "Sales Agent",
    tagline: "Your autonomous sales research team.",
    description: "AI sales workforce specialized in discovering, researching and qualifying real candidate companies against your ideal customer profile.",
    accent: "#2563eb",
    icon: "TrendingUp",
    status: "available",
    whoItIs: "A sales research specialist that finds and qualifies real accounts, grounded in real sources — never a guessed list.",
    autonomousActions: ["Discover candidate accounts", "Research each account", "Score against your ICP", "Explain the evidence"],
    businessOutcomes: [
      { label: "Qualified leads", real: true },
      { label: "Candidates researched", real: true },
      { label: "Qualification quality", real: true },
      { label: "Pipeline generated", real: false, connectHint: "Connect your CRM to measure pipeline generated" },
      { label: "Meetings booked", real: false, connectHint: "Connect your calendar/CRM to measure meetings booked" },
    ],
    deliverableLabel: "Qualified candidate accounts, each with real supporting evidence",
    workerRoleLabel: "Sales Agent Worker",
    primarySkillId: "skill_lead_qualification",
    secondarySkillIds: ["skill_trend_research"],
    onboarding: [
      { key: "business", bucket: "business", label: "What does your business sell?", type: "textarea", required: true, placeholder: "We sell project-management software to mid-market agencies." },
      { key: "audience", bucket: "audience", label: "What does your ideal customer look like?", type: "textarea", required: true, placeholder: "50-500 person agencies, US/EU, currently using spreadsheets or a legacy PM tool." },
      { key: "data", bucket: "data", label: "What signals matter most when qualifying an account?", type: "textarea", required: false, placeholder: "Recent hiring growth, a new office, or a tech-stack match." },
      { key: "process", bucket: "process", label: "How do you currently research and qualify leads?", type: "textarea", required: false, placeholder: "An SDR manually searches LinkedIn and the company site." },
      { key: "rules", bucket: "rules", label: "Anything that should disqualify an account, or need human review?", type: "textarea", required: false, placeholder: "Never qualify a company under 10 employees. Flag anything in a regulated industry." },
    ],
    realCapabilities: [
      "Real web-search-grounded account discovery and qualification (Lead Research & Qualification skill), framed by your real ICP",
      "Every candidate scored with real, cited evidence — never a fabricated match",
    ],
    notYetConnected: ["CRM (pipeline value, meetings, deal size)", "Outbound email/calling", "Calendar (meeting booking)"],
  },
  {
    id: "product_content_intelligence",
    slug: "content-intelligence",
    name: "Content Intelligence",
    tagline: "Know what to write, for this business specifically.",
    description:
      "AI content intelligence workforce specialized in discovering trends, identifying content opportunities and producing high-performing content.",
    accent: "#a855f7",
    icon: "PenLine",
    status: "available",
    whoItIs: "Part of your Marketing specialist — finds real content and topic opportunities grounded in your actual business and audience.",
    autonomousActions: ["Research current signals", "Identify content opportunities", "Rank by relevance", "Cite every source"],
    businessOutcomes: [
      { label: "Opportunities identified", real: true },
      { label: "Sources analyzed", real: true },
      { label: "Content quality", real: true },
      { label: "Reach", real: false, connectHint: "Connect analytics to measure reach" },
      { label: "Leads generated", real: false, connectHint: "Connect your CRM/forms to measure leads generated" },
    ],
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
    status: "available",
    whoItIs: "Part of your Marketing specialist — turns real topic signals into structured, source-cited page plans for your actual site.",
    autonomousActions: ["Discover topic opportunities", "Plan a page per opportunity", "Define search intent", "Cite every source"],
    businessOutcomes: [
      { label: "Page opportunities planned", real: true },
      { label: "Sources analyzed", real: true },
      { label: "Plan quality", real: true },
      { label: "Organic traffic", real: false, connectHint: "Connect Search Console to measure organic traffic" },
      { label: "Conversion", real: false, connectHint: "Connect analytics to measure conversion" },
    ],
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
    name: "Customer Success Agent",
    tagline: "Understands your customer, in your real context.",
    description:
      "AI customer operations workforce specialized in understanding conversations, using context and taking actions.",
    accent: "#14b8a6",
    icon: "Compass",
    status: "available",
    whoItIs: "A customer success specialist that responds to real customer requests, grounded in your real business rules — and knows when to hand off to a human.",
    autonomousActions: ["Read the customer's request", "Ground it in your real rules", "Respond or escalate", "Record the real decision"],
    businessOutcomes: [
      { label: "Requests handled", real: true },
      { label: "Response quality", real: true },
      { label: "Escalated to human", real: true },
      { label: "CSAT", real: false, connectHint: "Connect a survey/helpdesk tool to measure CSAT" },
      { label: "Resolution time", real: false, connectHint: "Connect your helpdesk to measure resolution time" },
    ],
    deliverableLabel: "A real, grounded response to a customer request, plus a real handling decision",
    workerRoleLabel: "Customer Success Worker",
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
  {
    id: "product_marketing_growth",
    slug: "marketing-growth",
    name: "Revenue / Growth Agent",
    tagline: "Coming soon — architecture only.",
    description: "Cross-functional growth workforce spanning acquisition, retention and revenue optimization. Not yet implemented.",
    accent: "#ec4899",
    icon: "Rocket",
    status: "coming_soon",
    whoItIs: "",
    autonomousActions: [],
    businessOutcomes: [],
    deliverableLabel: "",
    workerRoleLabel: "",
    secondarySkillIds: [],
    onboarding: [],
    realCapabilities: [],
    notYetConnected: [],
  },
  {
    id: "product_finance",
    slug: "finance",
    name: "Finance Agent",
    tagline: "Coming soon — architecture only.",
    description: "Finance operations workforce for reporting, reconciliation and spend analysis. Not yet implemented.",
    accent: "#0891b2",
    icon: "Wallet",
    status: "coming_soon",
    whoItIs: "",
    autonomousActions: [],
    businessOutcomes: [],
    deliverableLabel: "",
    workerRoleLabel: "",
    secondarySkillIds: [],
    onboarding: [],
    realCapabilities: [],
    notYetConnected: [],
  },
  {
    id: "product_operations",
    slug: "operations",
    name: "Operations Agent",
    tagline: "Coming soon — architecture only.",
    description: "Operations workforce for process automation and workflow optimization. Not yet implemented.",
    accent: "#65a30d",
    icon: "Settings",
    status: "coming_soon",
    whoItIs: "",
    autonomousActions: [],
    businessOutcomes: [],
    deliverableLabel: "",
    workerRoleLabel: "",
    secondarySkillIds: [],
    onboarding: [],
    realCapabilities: [],
    notYetConnected: [],
  },
  {
    id: "product_hr",
    slug: "hr",
    name: "HR Agent",
    tagline: "Coming soon — architecture only.",
    description: "People operations workforce for recruiting research and employee support. Not yet implemented.",
    accent: "#d97706",
    icon: "Users",
    status: "coming_soon",
    whoItIs: "",
    autonomousActions: [],
    businessOutcomes: [],
    deliverableLabel: "",
    workerRoleLabel: "",
    secondarySkillIds: [],
    onboarding: [],
    realCapabilities: [],
    notYetConnected: [],
  },
  {
    id: "product_ecommerce",
    slug: "ecommerce",
    name: "E-commerce Agent",
    tagline: "Coming soon — architecture only.",
    description: "E-commerce workforce for catalog, pricing and merchandising intelligence. Not yet implemented.",
    accent: "#be123c",
    icon: "ShoppingCart",
    status: "coming_soon",
    whoItIs: "",
    autonomousActions: [],
    businessOutcomes: [],
    deliverableLabel: "",
    workerRoleLabel: "",
    secondarySkillIds: [],
    onboarding: [],
    realCapabilities: [],
    notYetConnected: [],
  },
]

export function getProduct(id: string): ProductTemplate | undefined {
  return PRODUCT_CATALOG.find((p) => p.id === id)
}

export function getProductBySlug(slug: string): ProductTemplate | undefined {
  return PRODUCT_CATALOG.find((p) => p.slug === slug)
}

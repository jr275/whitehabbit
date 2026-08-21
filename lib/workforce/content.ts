/* ================================================================== *
 * OUTPUT CONTENT GENERATOR — turns "worker produced a `blog` output"
 * into a concrete, readable artifact: a title, a body, a channel, and
 * the quality/confidence numbers Outputs Hub reports on. Deterministic
 * enough to feel authored, varied enough to feel like real volume.
 * ================================================================== */

import type { OutputChannel, OutputKind, OutputStatus, Worker } from "./model"

function pick<T>(arr: T[], n: number): T {
  // n can arrive as a non-integer (timestamps mixed with Math.random()
  // offsets) — floor it so array indexing never lands on a float.
  return arr[Math.floor(Math.abs(n)) % arr.length]
}

function rand(n: number, salt = 0): number {
  // cheap deterministic-ish pseudo-random in [0,1) from an integer seed
  const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const COMPANIES = [
  "Acme Technologies",
  "Northwind Robotics",
  "Globex Analytics",
  "Initech Cloud",
  "Stark Dynamics",
  "Wayne Digital",
  "Hooli Labs",
  "Soylent Growth",
  "Piedmont Systems",
  "Umbrella Logistics",
  "Vertex Retail",
  "Meridian Health",
]

const PEOPLE: { name: string; title: string }[] = [
  { name: "Dana Whitfield", title: "VP Sales" },
  { name: "Marcus Lin", title: "Director RevOps" },
  { name: "Priya Nair", title: "CRO" },
  { name: "Sofia Ramos", title: "Head of Growth" },
  { name: "Ethan Cole", title: "Founder" },
  { name: "Grace Kim", title: "VP Marketing" },
  { name: "Oliver Bennett", title: "Head of Sales" },
  { name: "Aisha Karim", title: "COO" },
]

const BLOG_TOPICS = [
  "How AI Workers Are Changing B2B Sales",
  "The Real Cost of Manual Lead Qualification",
  "Why Response Time Still Wins Deals",
  "Turning Cold Outreach Into Warm Pipeline",
  "What Great Discovery Calls Have in Common",
  "The Growth Team's Guide to Signal-Based Selling",
  "From Dashboards to Decisions: Reading Your Funnel",
  "Automation Without Losing the Human Touch",
]

const REEL_TOPICS = [
  "3 signs a prospect is ready to buy",
  "Behind the scenes: a day with our AI worker",
  "The outreach message that got a 40% reply rate",
  "Why we stopped cold calling",
  "One chart that changed our GTM strategy",
]

const DM_QUESTIONS = [
  "How much does this cost?",
  "Do you integrate with our CRM?",
  "Can I get a demo this week?",
  "What makes this different from [competitor]?",
  "Is there a free trial?",
  "How long does onboarding take?",
]

const OBJECTIONS = ["pricing", "implementation time", "seat limits", "data privacy", "integration scope"]

const RECOMMENDED_ACTIONS = ["Outbound outreach", "Schedule discovery call", "Send case study", "Route to sales", "Nurture — not yet ready"]

const MODELS = ["whitehabbit-worker-v3"]

export interface GeneratedOutput {
  title: string
  content: string
  channel?: OutputChannel
  status: OutputStatus
  qualityScore: number
  confidenceScore: number
  taskSuccess: number
  policyCompliance: number
  brandAdherence: number
  factuality: number
  input?: string
  toolsUsed: string[]
  knowledgeUsed: string[]
  policyChecks: string[]
  approval: "not_required" | "approved" | "pending"
  durationMs: number
  model: string
}

/** Generate one realistic output artifact of `kind` for `worker`, seeded by `n`. */
export function generateOutput(kind: OutputKind, worker: Worker, n: number): GeneratedOutput {
  const company = pick(COMPANIES, n)
  const person = pick(PEOPLE, n + 3)
  const r = rand(n, kind.length)

  // ~7% of communication/sales outputs land below the quality bar — real
  // signal for the Evolve recommendation, not decoration.
  const isWeak = (kind === "dm" || kind === "email") && r < 0.09
  const quality = isWeak ? 58 + Math.round(rand(n, 1) * 10) : 84 + Math.round(rand(n, 2) * 14)
  const confidence = Math.max(40, quality - 4 + Math.round(rand(n, 4) * 8))
  const durationMs = 8_000 + Math.round(rand(n, 5) * 90_000)
  const model = pick(MODELS, 0)

  const base = {
    qualityScore: quality,
    confidenceScore: confidence,
    taskSuccess: isWeak ? 62 : 96 + Math.round(rand(n, 6) * 4),
    policyCompliance: 96 + Math.round(rand(n, 7) * 4),
    brandAdherence: 90 + Math.round(rand(n, 8) * 9),
    factuality: 92 + Math.round(rand(n, 9) * 8),
    toolsUsed: [] as string[],
    knowledgeUsed: [] as string[],
    policyChecks: ["Confidence above policy floor", "Brand tone check"],
    approval: "not_required" as const,
    durationMs,
    model,
  }

  switch (kind) {
    case "research": {
      const fit = 72 + Math.round(rand(n, 10) * 26)
      const signals = ["Hiring 14 engineers", "Recent Series B funding", "New GTM leadership", "Expanding RevOps team", "Active procurement signal"]
      return {
        ...base,
        title: `${company}`,
        channel: "web",
        status: "completed",
        input: `Research ${company} for enterprise fit`,
        content: `ICP fit: ${fit}%\nBuying signal: ${pick(signals, n)}\nRecommended action: ${pick(RECOMMENDED_ACTIONS, n + 1)}`,
        toolsUsed: ["Google Search", "CRM"],
        knowledgeUsed: ["Sales playbook", "CRM export"],
      }
    }
    case "blog": {
      const topic = pick(BLOG_TOPICS, n)
      return {
        ...base,
        title: topic,
        channel: "cms",
        status: r < 0.4 ? "draft" : "published",
        input: `Write a blog post about ${topic.toLowerCase()}`,
        content: `A ${380 + Math.round(rand(n, 11) * 400)}-word article exploring "${topic}", written in ${worker.identity.tone.join(", ").toLowerCase() || "the worker's"} tone. Optimized for organic search and internal linking.`,
        toolsUsed: ["CMS"],
        knowledgeUsed: ["Brand guidelines", "Product documentation"],
      }
    }
    case "reel": {
      const topic = pick(REEL_TOPICS, n)
      return {
        ...base,
        title: topic,
        channel: "instagram",
        status: r < 0.3 ? "draft" : "published",
        input: `Create a Reel script about ${topic.toLowerCase()}`,
        content: `15-second script + shot list for "${topic}". Hook in first 2 seconds, captioned, brand music bed.`,
        toolsUsed: ["Instagram"],
        knowledgeUsed: ["Brand guidelines"],
      }
    }
    case "social_post": {
      return {
        ...base,
        title: `Instagram post — ${pick(REEL_TOPICS, n + 2)}`,
        channel: "instagram",
        status: r < 0.3 ? "draft" : "published",
        content: `Caption + single-image creative referencing "${pick(REEL_TOPICS, n + 2)}".`,
        toolsUsed: ["Instagram"],
        knowledgeUsed: ["Brand guidelines"],
      }
    }
    case "dm": {
      const q = pick(DM_QUESTIONS, n)
      return {
        ...base,
        title: `DM reply to ${person.name}`,
        channel: "instagram",
        status: isWeak ? "failed" : "completed",
        input: q,
        content: isWeak
          ? `Draft held — response confidence below the policy floor. Detected objection: ${pick(OBJECTIONS, n)}.`
          : `"${answerFor(q)}"`,
        toolsUsed: ["Instagram"],
        knowledgeUsed: ["FAQ", "Sales playbook"],
        policyChecks: isWeak
          ? ["Confidence below policy floor", "Escalated for human review"]
          : base.policyChecks,
        approval: isWeak ? "pending" : "not_required",
      }
    }
    case "email": {
      const objection = pick(OBJECTIONS, n)
      return {
        ...base,
        title: r < 0.5 ? `Outreach to ${person.name}` : `Reply to ${person.name}`,
        channel: "email",
        status: isWeak ? "failed" : "completed",
        input: r < 0.5 ? `Draft first-touch outreach to ${person.name} at ${company}` : `Objection: ${objection}`,
        content: isWeak
          ? `Draft held — response confidence below the policy floor. Detected objection: ${objection}.`
          : `Hi ${person.name.split(" ")[0]},\n\nPersonalized note referencing ${company}'s recent activity, closing with a soft call to action.\n\n— ${worker.identity.name}`,
        toolsUsed: ["Email"],
        knowledgeUsed: ["Sales playbook"],
        approval: isWeak ? "pending" : "not_required",
      }
    }
    case "lead": {
      const score = 58 + Math.round(rand(n, 12) * 40)
      return {
        ...base,
        title: `${person.name} qualified`,
        channel: "crm",
        status: "completed",
        input: `Qualify ${person.name} (${person.title}) at ${company}`,
        content: `${person.name} · ${person.title} · ${company}\nLead score: ${score}\nNext action: ${score > 80 ? "Schedule meeting" : "Nurture"}`,
        toolsUsed: ["CRM"],
        knowledgeUsed: ["CRM export"],
      }
    }
    case "meeting": {
      const day = pick(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], n)
      const hour = 9 + (Math.floor(Math.abs(n)) % 8)
      return {
        ...base,
        title: `Discovery call — ${company}`,
        channel: "web",
        status: "completed",
        input: `Book a discovery call with ${person.name} at ${company}`,
        content: `With: ${person.name}, ${person.title}\nWhen: ${day}, ${hour}:00\nType: Discovery`,
        toolsUsed: ["Calendar"],
        knowledgeUsed: [],
      }
    }
    case "crm": {
      return {
        ...base,
        title: `CRM updated — ${company}`,
        channel: "crm",
        status: "completed",
        input: `Sync latest activity for ${company}`,
        content: `Opportunity stage advanced. Contact enriched: ${person.name} (${person.title}).`,
        toolsUsed: ["CRM"],
        knowledgeUsed: ["CRM export"],
      }
    }
    case "analysis": {
      return {
        ...base,
        title: `Competitive analysis — ${company}`,
        channel: "web",
        status: "completed",
        input: `Analyze ${company}'s positioning`,
        content: `Positioning summary, pricing comparison, and 3 differentiation angles for ${company}.`,
        toolsUsed: ["Google Search", "Analytics"],
        knowledgeUsed: ["Brand guidelines"],
      }
    }
    case "support": {
      return {
        ...base,
        title: `Support reply to ${person.name}`,
        channel: "email",
        status: "completed",
        input: "Inbound support question",
        content: `Resolved: walked ${person.name} through the requested change with a link to the relevant doc.`,
        toolsUsed: ["Email"],
        knowledgeUsed: ["FAQ", "Product documentation"],
      }
    }
  }
}

function answerFor(question: string): string {
  if (/cost|pricing|price/i.test(question)) return "Happy to help. Pricing depends on team size and usage — I can put together a quick estimate, what's your team size?"
  if (/crm|integrat/i.test(question)) return "Yes — native integrations with Salesforce, HubSpot and most major CRMs. Want a walkthrough?"
  if (/demo/i.test(question)) return "Absolutely, I have openings Thursday and Friday this week — which works better?"
  if (/trial/i.test(question)) return "Yes, a 14-day free trial with no card required. I can set that up now if you'd like."
  if (/onboard/i.test(question)) return "Most teams are fully onboarded within a week. I can share the exact steps if useful."
  return "Great question — let me pull together the details and follow up shortly."
}

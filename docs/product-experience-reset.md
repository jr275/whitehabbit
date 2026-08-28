# Product Experience Reset

Status: accepted direction, not yet implemented. This document is the correction of record for a real product-framing drift identified in the current UI. It supersedes no ADR — it sits above them, as the lens future UI ADRs and PRs should be read through. Nothing in this document changes the backend, the domain model, or any shipped code. It is a product-and-UX reset, not an engineering one.

---

## 1. Product thesis

The product is a **programmatic SEO intelligence and contextual page generation platform**. It takes a company's data, entities, market signals, search intent, and existing knowledge, and turns them into high-quality, contextual, programmatically generated web pages — pages that should exist because a real gap and real demand justify them, not because a template was run N times.

The product answers, for a real business: *what should exist on our site, why, for whom, and what should it say* — and then actually produces that page, measures it, and gets better at the next one.

## 2. Product positioning

The product is **not** an AI agent platform, an AI workforce platform, or a workflow orchestration tool that happens to be used for SEO. It is an SEO/content intelligence product. Agents, workers, skills, tools, and workflows are real and necessary — they are the *implementation mechanism* that makes the product's promises true (real data, real generation, real measurement, never fabricated). They are not what the product is *for*, and they must not be what a new user sees first, thinks in, or is asked to configure before getting value.

The positioning test: if a user's first five minutes require understanding "worker," "agent run," "skill," "tool," or "policy" before they see a single real SEO opportunity for their own site, the product has already mispositioned itself.

## 3. Primary user mental model

The user should think in the vocabulary of their own domain:

- Website, market, search demand
- Topics, entities, intent
- Opportunities
- Pages, content
- Internal links, schema
- Performance, AI visibility

The user should **not** need to think in the vocabulary of this codebase's implementation:

- Agent, worker, tool call
- Orchestration, workflow graph
- Agent run, policy, autonomy level, approval queue

Both vocabularies are real in this system. The first is the product's surface language. The second is real, necessary, and stays exactly as real as it is today — it simply does not get to be the *first* vocabulary a user learns.

## 4. Primary product loop

```
DISCOVER (market / search signal)
  → UNDERSTAND CONTEXT (entities, intent, competitive/knowledge gaps)
    → IDENTIFY OPPORTUNITY (a real, scored, explainable gap)
      → DESIGN PAGE (what this page should be, and why)
        → GENERATE PAGE (real content, real entities, real structure)
          → OPTIMIZE (SEO / AEO / GEO / internal links / schema)
            → PUBLISH
              → MEASURE (real outcomes: impressions, rankings, AI citations)
                → LEARN (calibrate scoring on what actually worked)
                  → back to DISCOVER, sharper than before
```

This loop is not new engineering. It is, almost exactly, the real Signal → Observation → Decision → Action → Outcome → Learning Loop chain this codebase already implements end-to-end (`lib/intelligence/*`, Phases 6–8 of the existing roadmap). **The loop is real and already built.** What is missing is a product surface that presents it in this order, in this language, as the thing the user is doing — instead of presenting its implementation (agents, runs, workflows) as the thing the user is doing.

## 5. Secondary agent loop

Underneath the product loop, a real automation loop runs: an approved Decision resolves to an Action Plan, a Policy Engine gates it, a Workflow Engine executes it durably via real Agent Runs, checkpointed and retried. This is genuinely excellent, tested infrastructure (`lib/workflow/*`, `lib/intelligence/action-executor.ts`, ADR-038/039). It stays exactly as it is.

Its UI role changes: it becomes the *explanation* and *advanced control surface* behind a product action, not the primary navigation. When a user clicks "Generate this page," the real Decision → Action → Workflow → Agent Run chain fires underneath — the user sees "Generating your page…" with a real progress state, not "Agent Run `run_a8b2d0…` queued on pipeline `content_generation`." A "Show what's happening" or "Advanced" affordance can drop into the real, existing Agent Run Inspector for anyone who wants the machinery — power users, debugging, trust-building. It is one click deeper, not the front door.

## 6. Product vs. infrastructure

| Layer | What it is | Examples in this codebase | User-facing? |
|---|---|---|---|
| **Product** | What the user buys and thinks in | Opportunities, Pages, Content, Knowledge, Performance, AI Visibility | Yes — primary nav, homepage, first five minutes |
| **Intelligence** | The real engine producing product-layer results | Context/Entity Resolution, Intent Graph, Opportunity Engine, Knowledge Graph, Trend Engine, SEO/AEO/GEO scoring, Information Gain | Partially — surfaced as *explanations* ("why this page," "why this score"), not as its own primary destination |
| **Agent/Automation** | How the intelligence layer actually does work | Agents, Workers, Skills, Tools, Policies, Executions, Workflows | Secondary/system surface — real, inspectable, never hidden, never primary |
| **Infrastructure** | What makes any of it real | Postgres, job queues, Postgres NOTIFY events, observability, integrations, storage | No — never user-facing except through Settings/Integrations |

Nothing here asks anything in the Intelligence, Agent, or Infrastructure layers to change. It asks the Product layer to exist as its own thing, sitting in front of the rest, rather than the Agent/Automation layer's own admin surface being handed to the user as if it were the product.

## 7. Primary information architecture

Not being implemented yet — proposed for evaluation before any nav change is made.

**Primary nav (product layer):**
- Overview
- Research
- Opportunities
- Pages *(includes generation — see §11)*
- Content
- Knowledge
- Performance
- AI Visibility
- Integrations
- Settings

**Secondary/system nav (agent/automation layer — one level down, clearly labeled "Advanced" or "System"):**
- Agents
- Workers
- Runs
- Tools
- Policies
- Executions
- Audit

Mapping from what exists today, so nothing is read as "delete and rebuild":

| Exists today | Product-layer home | Notes |
|---|---|---|
| `/opportunities` | **Opportunities** | Already correctly named — keep as-is, becomes primary nav |
| `/intelligence/decisions` (Decision Center) | Folds into **Opportunities** / **Pages** as "what should I do next" | The concept is right; the current standalone "Decision Center" label is system-layer language for a product-layer question |
| `/knowledge` (Knowledge Graph) | **Knowledge** | Rename display label from "Knowledge Graph" to "Knowledge"; the graph is one view inside it, not the section's identity |
| `/intelligence/map` (Intelligence Graph) | Folds into **Opportunities**/**Knowledge** as an exploration view | Real, valuable — becomes a view mode, not its own top-level destination |
| `/intelligence/timeline` | Folds into **Performance**/**Opportunities** as "what happened" | Same underlying data, product-framed |
| `/observatory`, `/outcomes` | **Performance** | |
| AI visibility features (`app/api/v1/ai-visibility/*`) | **AI Visibility** | Already exists as a real capability with no primary-nav home today |
| `/websites` | **Research** or **Settings** (site connection) | The *discovery* work a website connection triggers belongs in Research; the connection itself is closer to Settings |
| `/mission` (Mission Control), `/agents/live` (Live Agent Graph), `/workforce`, `/studio`, `/factory`, `/library` (Skills), `/approvals`, `/integrations` (agent-facing parts) | **System / Advanced** | Real, kept, not primary |

## 8. Homepage experience

Today, `app/page.tsx` renders `components/home/product-home.tsx`, whose actual copy reads: *"AI workforce operations" / "Monitor live work, resolve operating issues, and move from a business objective to a released Worker"* with a first-run panel titled *"Deploy your first Worker"* and three steps — *"1. Define the objective," "2. Configure and build," "3. Run and observe"* — plus primary CTAs "New Worker" and "Open Studio." This is the single clearest piece of evidence for the drift this document corrects: the file is literally named `product-home.tsx`, but its content is 100% agent-factory onboarding.

**What the homepage should answer**, using this codebase's own real, already-computed data (`lib/intelligence/mission.ts#buildMissionSnapshot()` already computes most of this — see §6, nothing new to build to answer these questions):

- What is happening with my SEO right now?
- What opportunities exist, and how many are new?
- What pages should I create next, and why?
- What pages are being generated right now?
- What is already live, and how is it doing?
- Where is the greatest untapped potential?

**First-run state** for a brand-new org should not say "Deploy your first Worker." It should say something like "Connect a website to discover your first opportunities" (steps: **Connect → Discover → Create**), because a user who has never seen a single opportunity yet has nothing to manage, run, or observe — they have a website to connect and a market to discover.

## 9. Research experience

The product-layer home for market/entity/intent discovery — today's real `website_discovery` pipeline output (entities, markets, roles, intents extracted from a connected site) with no dedicated product surface of its own; it currently only shows up indirectly through Knowledge/Opportunities. Research should let a user enter a market (the brief's own example: "Hotels in Brazil") and see what the system already understands: locations, entities, categories, search intent, seasonality, competitive/content gaps — framed as understanding, not as a crawl log.

## 10. Opportunity experience

Already the best-named surface in the app (`/opportunities`) and should stay the anchor of the product loop. It should show, per opportunity, real business-value/information-gain/score breakdowns (already computed, see `lib/opportunity/discovery.ts`, `lib/intelligence/action-plan.ts`) as *why this matters*, not as raw scoring internals. Filterable by the "destination / intent / property type / traveler type / …" style facets the brief describes — which map directly to this codebase's real Market/Role/Intent entity types, already modeled in the Knowledge Graph.

## 11. Page generation experience

The brief calls this "the hero." It already has a full, real backend (`lib/content-pipeline/*`: Research → Outline → Draft → SEO → GEO → Quality → Information Gain gate → Decide-publish) with nothing fake in the chain. What's missing is a product-facing surface that narrates it as *context becoming a page*, not as a workflow run's step list. The existing Live Agent Graph's real per-step checkpoint state (§10 of Phase 8, `components/mission/live-agent-graph.tsx`) is the right *data* for this — it needs a page-generation-specific narration layer ("Researching your market…" → "Drafting your page…" → "Checking it has enough real substance…" → "Optimizing…" → "Ready"), not a pipeline-stage chip row.

## 12. Page experience

A generated page's detail view should make **why this page exists** legible: the opportunity that justified it, the entities and intent it satisfies, the real content, the real SEO/AEO/GEO signals, the real internal links, the real structured data, and — once measured — real performance. Every one of these is real, already-persisted data (`pages`, `page_briefs`, entity relationships, `intelligence_relations`); this is a presentation surface, not new domain work.

## 13. Content experience

Where the actual generated content lives and can be reviewed/edited before or after publish. Distinct from "Page" (the page's full context/metadata/performance) — Content is the editorial surface, closer to a document than a dashboard row.

## 14. Knowledge experience

The existing Knowledge Graph (`/knowledge`) is real and valuable and should remain, but reframed as *the company's understanding of its market* rather than a graph-visualization product in its own right. Entity detail (facts, evidence, relationships, aliases, provenance) is already a named gap from the Phase 8 pending list — closing it serves this reframe directly, since "what does the system know, and how sure is it" is core to the product thesis (§1), not a system-layer nicety.

## 15. Performance experience

Real outcomes (`intelligence_outcomes`, Search Console data when connected) presented as "is this working," not as a metrics-dashboard grid. This is where the Learning Loop's real effect becomes visible to the user: pages the system got right, pages it's still calibrating on, and — critically — honest `OUTCOME_PENDING` states rather than a zero standing in for "not enough data yet" (a discipline this codebase already holds internally; it needs to survive into the product surface unchanged).

## 16. AI Visibility experience

A real, already-built capability (`app/api/v1/ai-visibility/*`, AI citation tracking) with no dedicated primary-nav home today — folded invisibly into other surfaces. Given how central "does an LLM cite my page" is to this product's differentiation, it deserves to be named and findable on its own, not discovered by accident.

## 17. Agent experience

Reframed, not removed. The user's *default* view of agent work is outcome language: **Insight → Opportunity → Recommendation → Action → Result** — matching this codebase's own real Signal → Observation → Decision → Action → Outcome chain almost verbatim (§4). The agent is allowed to name itself when it's genuinely useful trust-building context — "Scrooge analyzed 18,421 entities and identified 340 real gaps" is a real, honest sentence this system can already produce from real data — but that sentence is in service of the opportunity, not a substitute for showing the opportunity.

## 18. Worker experience

Workers, Skills, Tools, the Factory, and Worker Studio remain exactly as real and as functional as they are today. They move to the System/Advanced navigation tier (§7). A new user should be able to get full value from Discover → Opportunity → Page → Publish → Measure without ever visiting `/workforce`, `/factory`, or `/studio` — those stay available for the user who wants to configure automation directly, which is a real, legitimate, more-advanced use case this product should keep serving.

## 19. Design direction

Premium, editorial, intelligent, calm, high-signal — an **intelligent editorial workspace**, not an AI operations dashboard. Strong typography, real whitespace, clear hierarchy, beautiful and honest data presentation (Known/Estimated/Unavailable discipline extended into visual design, not just copy), restrained color used for real meaning (a score, a trend, a status) rather than decoration, high-quality empty and loading states that teach rather than just spin.

This codebase's existing design tokens (`--color-primary`, `--color-grow`, `--color-warn`, `--color-destructive`, the `font-mono uppercase tracking-[0.Xem]` label convention) are a real, usable foundation — the reset is about composition and emphasis, not throwing out the token system.

## 20. Design anti-patterns

Explicitly avoid: generic blue SaaS buttons as the default interactive language everywhere; giant undifferentiated card grids; agent avatars/personas; graphs and node-diagrams as decoration rather than as the answer to a specific question; developer-console aesthetics (dense monospace status rows, log-like feeds) as the *primary* surface; excessive badges and pill counts; a default-dark enterprise-dashboard shell; "AI" iconography as decoration (sparkle icons, robot glyphs) standing in for an actual real result; technical terminology (agent, worker, run, pipeline, workflow, policy) in primary-surface copy.

## 21. Current UI problems

Grounded in this codebase's actual current state, not a general critique:

- **Terminology.** The homepage's own copy — *"AI workforce operations," "Deploy your first Worker," "Define the objective → Configure and build → Run and observe"* (`components/home/product-home.tsx`) — is textbook agent-factory onboarding language, not SEO-product language. "Worker," "Agent Run," "Workflow," "Policy," "Autonomy" recur across primary nav labels (Workers, Runs & Outputs, Live Agent Graph, Mission Control) rather than being confined to a system area.
- **Navigation.** `components/studio/top-nav.tsx`'s five groups — Workspace, Knowledge, Build, Connect, Observe — organize by *system layer* (what kind of infrastructure this is) rather than by *product loop* (what the user is trying to do). "Build" (Worker Studio, Factory, Skills) sits at the same navigational weight as "Knowledge" (Opportunities, Decision Center), telling a new user that configuring agents is as central as finding opportunities.
- **Visual/page hierarchy.** The homepage's primary CTAs are "New Worker" and "Open Studio" — the first actions a new user is offered are agent-configuration actions, not "connect a website" or "see your first opportunity."
- **CTA hierarchy.** First-run guidance (`FirstRun()` in `product-home.tsx`) walks a user through building an agent (objective → configure → run) rather than through the product loop (connect → discover → create).
- **Density/component language.** Recent additions (Live Agent Graph's step-chip rows, the multi-mode Intelligence Graph, the grouped-dropdown nav) are genuinely well-built *and* genuinely operational/developer-console in character — real progress on the wrong layer's front door.
- **Information architecture.** Decision Center, Intelligence Graph, and Intelligence Timeline are each standalone top-level destinations for what is, from the product's point of view, one underlying question ("what should I do, and what happened") — system-layer objects (Decision, Action, Timeline Entry) each got their own nav slot instead of being unified around the product question they answer.

None of this reflects bad engineering — every surface named above is real, tested, and does what it says. The problem is exclusively what got promoted to primary and what vocabulary greeted the user first.

## 22. What to preserve

Everything in the Intelligence, Agent/Automation, and Infrastructure layers (§6), unchanged: the full Signal → Observation → Decision → Action → Outcome → Learning chain, the Workflow Engine and its durability/idempotency guarantees, the Policy Engine, the Knowledge Graph's real entity resolution, the Information Gain gate, the content pipeline, the multi-mode Intelligence Graph's data layer (`lib/intelligence/map.ts`), the Intelligence Timeline's data layer and filters, the Command Palette's real search backend, the design token system, the existing test suite and its tenant-isolation discipline. All of Phase 6–8's real, verified backend work is exactly as valuable under this reset as it was before it.

## 23. What to demote

Workers, Skills, Tools, Factory, Worker Studio, Mission Control, Live Agent Graph, Decision Center (as a standalone destination — its *function* moves into Opportunities/Pages), Approvals, Runs & Outputs — all move from primary to System/Advanced navigation. None are deleted, hidden behind a paywall, or made harder to reach for a user who wants them; they simply stop being what a new user sees first.

## 24. What to rebuild

Nothing at the code level, from this document alone. What needs building, once a follow-up phase is scoped and approved, is new *product-layer presentation* over already-real data: a reframed Overview/homepage, a Research surface, a page-generation narration layer, and the Information Architecture regrouping in §7. All of it is UI and copy work against existing, real APIs — not new backend, not a rewrite.

## 25. Recommended UX roadmap

1. **Homepage reset** (§8) — replace `product-home.tsx`'s workforce framing with the SEO-intelligence framing, reusing `buildMissionSnapshot()`'s real data. Highest leverage: it's the first five seconds of the product, and it's a presentation change over data that already exists.
2. **Information architecture regroup** (§7) — move Workers/Factory/Studio/Mission Control/Live Agent Graph/Approvals to a System/Advanced nav tier; promote Opportunities/Pages/Knowledge/Performance/AI Visibility to primary.
3. **Opportunity → Page generation narration** (§11) — the differentiated "hero" moment; reuse the real content pipeline and Live Agent Graph's real checkpoint data under new, product-facing copy.
4. **Page detail experience** (§12) — make "why this page exists" legible over already-persisted data.
5. **Research surface** (§9) and **Knowledge entity detail** (§14) — close the two most-cited real gaps that also happen to reinforce the "understand my market" thesis.
6. **Performance and AI Visibility** (§15–16) — give the Learning Loop and AI citation tracking their own honest, product-framed home.

---

## Final output

**A. What is wrong with the current product experience**
The UI, navigation, and homepage copy present this system as an AI workforce/agent-operations platform first, and an SEO intelligence product second (if at all). The homepage's literal copy ("AI workforce operations," "Deploy your first Worker") and the primary nav's system-layer grouping (Workspace/Knowledge/Build/Connect/Observe) put agent configuration and operational monitoring at the front door instead of opportunity discovery and page generation.

**B. What the product should actually feel like**
An intelligent editorial workspace for programmatic SEO — calm, high-signal, premium — where a user opens the app and immediately sees what's happening with their SEO, what opportunities exist, and what page they should create next. The intelligence (real scoring, real entity resolution, real Information Gain) should feel like a trustworthy analyst's output. The machinery producing it (agents, workflows, runs) should be one click away, never the first thing shown.

**C. What we should preserve from the existing codebase**
All of it, at the domain/backend layer: the full Decision Layer, Workflow Engine, Policy Engine, Knowledge Graph, content pipeline, Information Gain gate, Learning Loop, the multi-mode Intelligence Graph's and Timeline's real data layers, the Command Palette's real search, the design token system, and the entire real test suite. This reset touches presentation and navigation only.

**D. What should become secondary/internal**
Workers, Skills, Tools, Factory, Worker Studio, Mission Control, Live Agent Graph, Decision Center as a standalone destination, Approvals, Runs & Outputs — all real, all kept, all moved one level down into a System/Advanced navigation tier.

**E. The new primary user journey**
Connect a website → see real discovered opportunities → understand why each matters → generate the right page → see it optimized and published → measure real performance → watch the system get sharper next time. Every step of this journey already has a real backend; none of it is new domain work.

**F. The first UX surface we should build**
The homepage/Overview reset (§8, §25 item 1).

**G. Why that surface should be first**
It is the highest-leverage, lowest-risk change available: it is the very first thing every user sees, it requires no new backend (`buildMissionSnapshot()` already computes real KPIs a reframed homepage can present as-is), and it is the single clearest, most concrete piece of evidence that the product-direction problem this document exists to fix is real — its current copy is the smoking gun cited in §21.

**H. The exact next implementation prompt**
> "Rebuild the homepage (`components/home/product-home.tsx`, rendered by `app/page.tsx`) to answer the six product-layer questions in `docs/product-experience-reset.md` §8, using the real data `lib/intelligence/mission.ts#buildMissionSnapshot()` already computes — no new backend. Replace the 'AI workforce operations' framing and the 'Deploy your first Worker' first-run flow with SEO-intelligence framing and a 'Connect a website → Discover opportunities → Create your first page' first-run flow. Do not touch navigation, other pages, or any backend code in this pass — homepage only, then stop and verify with a real dev-server + Playwright pass before committing."

---

Stopping here per the task's explicit scope. No UI was redesigned, no navigation was changed, no pages were built, deleted, or refactored. Only this document was created.

## Implementation note (Phase UX-2)

`components/home/product-home.tsx` was rebuilt around this document's §8 (Homepage experience), using only already-real data — `lib/intelligence/mission.ts#buildMissionSnapshot()`, `GET /api/opportunities`, `GET /api/pages`, `GET /api/projects/:id/websites` — no new backend, no fabricated numbers. It stopped reading `lib/workforce/store.ts` (the Worker/Execution/Output model) entirely; that store and every other page still using it (`/workforce`, `/factory`, `/studio`, `/observatory`, `/outputs`, etc.) is untouched.

**What changed**: the "AI workforce operations" hero and "Deploy your first Worker" onboarding are gone. Three real states now drive the page — no website connected (Connect → Discover → Create explainer), a website connected but discovery not yet producing entities/opportunities (per-website real `discoveryStatus` shown, e.g. "identifying entities, markets, and intent"), and a populated state following the brief's six-level hierarchy: the real opportunity/entity count as the lead sentence, the real "What to do next" panel (the same `resolveNextAction()` → approve → `POST .../execute` chain Mission Control uses — verified end-to-end in a real Playwright pass, including watching the panel correctly disappear once the one real pending Decision was consumed), real top-scored opportunities, real recently-created pages, real Search Console performance when connected (an honest empty state explaining what's needed when not), and a de-emphasized evidence footer.

**What remains** (named in §21-24, not newly discovered): `app/layout.tsx`'s root `<meta name="description">` still reads "Build, deploy, and operate an AI workforce…" — real, crawler/social-preview-facing copy that contradicts this reset, left untouched because it is layout-level, not homepage-scoped, per this pass's explicit boundaries. Navigation, Mission Control, Decision Center, and every other system-layer surface named in §7/§23 are unchanged, as instructed.

**What data is currently available**: everything the populated state renders is real and already persisted — no gaps in `buildMissionSnapshot()` blocked anything the homepage needed to show honestly.

**What future backend capabilities would help**: a lightweight opportunity-count-only endpoint (today's `GET /api/opportunities` returns full rows for a homepage that only needs a count and a top-N slice — fine at current scale, worth revisiting at high opportunity volume, consistent with risks.md R-48/R-49's existing scale notes); a dedicated `/pages` index route (only `/pages/:id` exists today, so the homepage's Pages panel links to individual real pages but has no "view all" destination); and, longer-term, real historical time-series under `intelligence_outcomes`/`search_console_snapshots` a homepage sparkline could render (out of scope for this pass — self-critique flagged the Performance section's tile-only treatment as the weakest visual differentiation from a dashboard, see the PR/commit description for the full self-critique).

"use client"

/* ================================================================== *
 * SEO INTELLIGENCE OVERVIEW — "Page Factory" (Phase UX-3) — the
 * homepage, redesigned around docs/product-experience-reset.md's
 * product thesis: this is a programmatic SEO intelligence + contextual
 * page generation platform, shown as a live production system
 * (Context -> Opportunity -> Page -> Publish -> Performance -> Learning),
 * not a report about one. Every number, stage count, and stream event
 * on this page is real, already-persisted data read from existing APIs
 * (lib/intelligence/mission.ts#buildMissionSnapshot(), /api/opportunities,
 * /api/pages, /api/projects/:id/websites) — no new backend, nothing
 * mocked or fabricated. A stage or metric with no real data yet renders
 * as an honest empty state, never a fake zero or invented activity.
 *
 * Production stages are a presentation-layer mapping over this
 * codebase's real, already-closed status unions
 * (OpportunityStatus/PageStatus) — never a new status value invented
 * for this page. See STAGE labels below for the exact real-status ->
 * display-label mapping.
 *
 * Replaces the previous "AI workforce operations" framing (Workers,
 * Runs, Outputs, Events from lib/workforce/store.ts) entirely on this
 * page. That store and every page that still uses it are untouched —
 * this file alone stops reading it.
 * ================================================================== */

import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Clock3,
  Compass,
  Gauge,
  Globe,
  Sparkles,
  Target,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { TopNav } from "@/components/studio/top-nav"
import type { DecisionAction } from "@/lib/intelligence/decisions"
import type { MissionSnapshot, NextAction } from "@/lib/intelligence/mission"
import type { Opportunity } from "@/lib/opportunity/model"
import type { Page } from "@/lib/pages/model"
import type { Website } from "@/lib/websites/model"

interface HomeData {
  snapshot: MissionSnapshot
  projectId: string
  nextAction: NextAction | null
  opportunities: Opportunity[]
  pages: Page[]
  websites: Website[]
}

const DISCOVERY_COPY: Record<Website["discoveryStatus"], string> = {
  pending: "queued to begin",
  discovering: "mapping your site's structure",
  discovered: "structure mapped — extracting entities",
  crawling: "reading your pages",
  crawled: "pages read — analyzing content",
  analyzing: "identifying entities, markets, and intent",
  ready: "analysis complete",
  failed: "ran into a problem",
}

export function ProductHome() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const missionRes = await fetch("/api/v1/intelligence/mission")
      if (!missionRes.ok) throw new Error((await missionRes.json().catch(() => null))?.error ?? "Could not load your SEO intelligence overview.")
      const missionBody = await missionRes.json()
      const projectId: string = missionBody.projectId

      const [nextActionRes, oppRes, pagesRes, websitesRes] = await Promise.all([
        fetch("/api/v1/intelligence/next-action"),
        fetch("/api/opportunities"),
        fetch("/api/pages"),
        fetch(`/api/projects/${projectId}/websites`),
      ])
      const nextAction = nextActionRes.ok ? (await nextActionRes.json()).nextAction : null
      const opportunities: Opportunity[] = oppRes.ok ? (await oppRes.json()).opportunities : []
      const pages: Page[] = pagesRes.ok ? (await pagesRes.json()).pages : []
      const websites: Website[] = websitesRes.ok ? (await websitesRes.json()).websites : []

      setData({ snapshot: missionBody.snapshot, projectId, nextAction, opportunities, pages, websites })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your SEO intelligence overview.")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main id="main-content" className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 lg:py-14">
        {error ? (
          <StatePanel icon={CircleAlert} title="Could not load your overview" body={error} />
        ) : !data ? (
          <StatePanel icon={Clock3} title="Reading your SEO intelligence" body="Loading real, current data for your organization." />
        ) : data.websites.length === 0 ? (
          <FirstRunState />
        ) : data.snapshot.knowledgeAuthority.entityCount === 0 && data.opportunities.length === 0 ? (
          <DiscoveringState websites={data.websites} />
        ) : (
          <Overview data={data} onActed={load} />
        )}
      </main>
    </div>
  )
}

/* -------------------------------------------------------------- *
 * FIRST RUN — no website connected yet.
 * -------------------------------------------------------------- */
function FirstRunState() {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">SEO Intelligence</p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Discover what should exist on your site — before you build it</h1>
      <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
        Connect a website and this platform reads your market, your entities, and real search demand — then turns what it finds into contextual pages, produced start to finish.
      </p>
      <Link href="/websites" className="mt-7 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
        Connect your website <ArrowRight className="size-4" />
      </Link>

      <div className="mt-16 grid gap-8 border-t border-border pt-10 sm:grid-cols-3">
        <FirstRunStep index={1} icon={Globe} title="Connect" body="Point the platform at your website. Nothing is crawled until you say so." />
        <FirstRunStep index={2} icon={Compass} title="Discover" body="Real entities, markets, and search intent are mapped from your site and its market — turned into scored, explainable opportunities." />
        <FirstRunStep index={3} icon={Sparkles} title="Create" body="A real opportunity enters production — researched, written, optimized, published, and measured." />
      </div>
    </div>
  )
}

function FirstRunStep({ index, icon: Icon, title, body }: { index: number; icon: typeof Globe; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-full border border-border font-mono text-[11px] text-muted-foreground">{index}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3.5 text-sm font-semibold">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

/* -------------------------------------------------------------- *
 * DISCOVERING — a website is connected but real discovery hasn't
 * produced entities or opportunities yet.
 * -------------------------------------------------------------- */
function DiscoveringState({ websites }: { websites: Website[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">SEO Intelligence</p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Reading your market</h1>
      <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">Once discovery finishes, real opportunities enter production here — scored, explained, and ready to become pages.</p>

      <div className="mt-10 flex flex-col gap-3">
        {websites.map((site) => (
          <Link key={site.id} href={`/websites/${site.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{site.hostname}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{site.discoveryStatus === "failed" ? <span className="text-destructive">Discovery {DISCOVERY_COPY.failed} — {site.discoveryError ?? "see details"}</span> : `Discovery: ${DISCOVERY_COPY[site.discoveryStatus]}`}</p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ================================================================== *
 * PRODUCTION STAGE MODEL — the one real lifecycle this whole page is
 * organized around. Every stage below is a direct read of a real,
 * already-closed status value; nothing here is a new status.
 * ================================================================== */

type StageKey = "discovered" | "qualified" | "ready" | "generating" | "review" | "published"

const STAGE_META: Record<StageKey, { label: string; tone: string }> = {
  discovered: { label: "Discovered", tone: "text-muted-foreground" },
  qualified: { label: "Qualified", tone: "text-muted-foreground" },
  ready: { label: "Ready to create", tone: "text-primary" },
  generating: { label: "Generating", tone: "text-primary" },
  review: { label: "In review", tone: "text-warn" },
  published: { label: "Published", tone: "text-grow" },
}

interface StreamEvent {
  stage: StageKey | "rejected"
  title: string
  at: number
  href: string
}

function buildProductionStream(opportunities: Opportunity[], pages: Page[]): StreamEvent[] {
  const oppEvents: StreamEvent[] = opportunities
    .filter((o) => o.status === "discovered" || o.status === "qualified")
    .map((o) => ({ stage: o.status === "discovered" ? "discovered" : "qualified", title: o.title, at: o.updatedAt, href: "/opportunities" }))

  const pageEvents: StreamEvent[] = pages.map((p) => ({
    stage: p.status === "draft" ? "generating" : p.status === "ready" ? "review" : p.status === "published" ? "published" : "rejected",
    title: p.title ?? p.slug,
    at: p.updatedAt,
    href: `/pages/${p.id}`,
  }))

  return [...oppEvents, ...pageEvents].sort((a, b) => b.at - a.at).slice(0, 8)
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

const NEXT_ACTION_VERB: Partial<Record<DecisionAction, string>> = {
  CREATE_PAGE: "Create this page",
  UPDATE_PAGE: "Update this page",
  REFRESH_CONTENT: "Refresh this page",
  ADD_INTERNAL_LINKS: "Add these links",
  CREATE_HUB: "Create this hub",
  CREATE_COMPARISON: "Create this comparison",
  CREATE_FAQ: "Create this FAQ",
  INVESTIGATE_ENTITY: "Investigate this",
}

/* -------------------------------------------------------------- *
 * POPULATED OVERVIEW — the system at work: Context -> Opportunity
 * -> Page -> Publish -> Performance -> Learning.
 * -------------------------------------------------------------- */
function Overview({ data, onActed }: { data: HomeData; onActed: () => void }) {
  const { snapshot, opportunities, pages, websites } = data
  const primarySite = websites[0]

  const stageCounts: Record<StageKey, number> = {
    discovered: opportunities.filter((o) => o.status === "discovered").length,
    qualified: opportunities.filter((o) => o.status === "qualified").length,
    ready: opportunities.filter((o) => o.status === "approved").length,
    generating: pages.filter((p) => p.status === "draft").length,
    review: pages.filter((p) => p.status === "ready").length,
    published: pages.filter((p) => p.status === "published").length,
  }
  const needsReworkCount = pages.filter((p) => p.status === "quality_rejected").length

  const spotlightPage = [...pages].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const spotlightOpportunity = spotlightPage ? opportunities.find((o) => o.id === spotlightPage.opportunityId) : undefined

  const streamEvents = buildProductionStream(opportunities, pages)

  return (
    <div className="flex flex-col gap-12">
      {/* CONTEXT — identity: what site, what market */}
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">SEO Intelligence · {primarySite?.hostname ?? "Your site"}</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Your search landscape, in production</h1>
        <p className="mt-4 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">{opportunities.length} real opportunit{opportunities.length === 1 ? "y" : "ies"}</strong> found across{" "}
          <strong className="font-semibold text-foreground">{snapshot.knowledgeAuthority.entityCount} tracked entit{snapshot.knowledgeAuthority.entityCount === 1 ? "y" : "ies"}</strong> — {stageCounts.published} page{stageCounts.published === 1 ? "" : "s"} already live.
        </p>
      </header>

      {/* the one, contextual primary action */}
      {data.nextAction && <NextActionBanner nextAction={data.nextAction} onActed={onActed} />}

      {/* THE PIPELINE — the factory itself */}
      <Pipeline counts={stageCounts} needsRework={needsReworkCount} />

      {/* OPPORTUNITY -> PAGE — the relationship made visible */}
      {spotlightOpportunity && spotlightPage && <OpportunityToPage opportunity={spotlightOpportunity} page={spotlightPage} />}

      {/* the production line, live */}
      <section>
        <SectionHeader eyebrow="Production" title="What's happening right now" />
        {streamEvents.length === 0 ? (
          <EmptyNote icon={Target} title="Nothing in production yet" body="Once discovery finds an opportunity, its progress toward a published page will stream here." />
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {streamEvents.map((event, i) => <StreamRow key={`${event.href}:${event.title}:${i}`} event={event} />)}
          </ol>
        )}
      </section>

      {/* PERFORMANCE + LEARNING — the loop closing */}
      <section>
        <SectionHeader eyebrow="Performance & learning" title="Is it working" />
        <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {snapshot.organicGrowth ? (
            <>
              <PerformanceTile label="Search clicks" value={snapshot.organicGrowth.totalClicks.toLocaleString()} detail={`${snapshot.organicGrowth.snapshotDays}-day window`} />
              <PerformanceTile label="Search impressions" value={snapshot.organicGrowth.totalImpressions.toLocaleString()} detail="Google Search Console" />
            </>
          ) : (
            <div className="col-span-1 flex flex-col justify-center gap-1 bg-card px-5 py-4 sm:col-span-2">
              <p className="text-sm font-medium">Search performance not measured yet</p>
              <p className="text-[12.5px] text-muted-foreground">Connect Google Search Console (Integrations) once your pages are live.</p>
            </div>
          )}
          <PerformanceTile label="AI citations" value={snapshot.aiVisibility.citationCount.toLocaleString()} detail={`${snapshot.aiVisibility.answerCount} AI answers checked`} />
          <PerformanceTile
            label="Learning signal"
            value={snapshot.informationGain.sampleCount > 0 ? `${snapshot.informationGain.sampleCount}` : "—"}
            detail={snapshot.informationGain.sampleCount > 0 ? `pages checked for real substance${snapshot.informationGain.blockedCount > 0 ? `, ${snapshot.informationGain.blockedCount} sent back` : ""}` : "not enough data yet"}
          />
        </div>
      </section>

      {/* de-emphasized evidence */}
      <footer className="border-t border-border pt-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Evidence</p>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[12.5px] text-muted-foreground">
          <span>{snapshot.knowledgeAuthority.entityCount} entities tracked{snapshot.knowledgeAuthority.entitiesWithEvidencePct != null && <> · {snapshot.knowledgeAuthority.entitiesWithEvidencePct}% with real evidence</>}</span>
          <span>{snapshot.marketMomentum.risingTrendCount} of {snapshot.marketMomentum.totalTrendCount} tracked trends rising</span>
        </div>
      </footer>
    </div>
  )
}

function SectionHeader({ eyebrow, title, href }: { eyebrow: string; title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.01em]">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          View all <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- *
 * THE PIPELINE — real stage counts, connected left to right. On
 * narrow screens the row scrolls horizontally rather than wrapping,
 * so the production-line feel survives on mobile (never a stack of
 * unrelated cards).
 * -------------------------------------------------------------- */
function Pipeline({ counts, needsRework }: { counts: Record<StageKey, number>; needsRework: number }) {
  const order: StageKey[] = ["discovered", "qualified", "ready", "generating", "review", "published"]
  return (
    <section>
      <SectionHeader eyebrow="Page factory" title="From opportunity to published page" href="/opportunities" />
      <div className="relative mt-4">
        <div className="flex items-stretch gap-0 overflow-x-auto rounded-xl border border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {order.map((key, i) => {
            const meta = STAGE_META[key]
            const active = key === "generating" && counts.generating > 0
            return (
              <div key={key} className="flex shrink-0 items-stretch">
                <div className="flex min-w-[86px] flex-col justify-center gap-1.5 px-3 py-4 sm:min-w-[100px] sm:px-4 lg:min-w-[122px] lg:px-5 lg:py-5">
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground sm:text-[9px] sm:tracking-[0.12em]">{meta.label}</span>
                  <span className={`text-xl font-semibold tabular-nums tracking-[-0.02em] sm:text-2xl ${meta.tone} ${active ? "animate-pulse" : ""}`}>{counts[key]}</span>
                </div>
                {i < order.length - 1 && (
                  <div className="flex items-center px-0.5 text-border sm:px-1">
                    <ChevronRight className="size-4" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* scroll affordance — a real cue, not decoration: this row can
         * genuinely overflow on narrow viewports, and a silently
         * truncated pipeline would undercut the very thing this page
         * exists to show. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-card to-transparent lg:hidden" aria-hidden="true" />
      </div>
      {needsRework > 0 && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          <span className="text-warn">{needsRework}</span> page{needsRework === 1 ? "" : "s"} sent back for thin content — held by the real information-gain check, not published as-is.
        </p>
      )}
    </section>
  )
}

/* -------------------------------------------------------------- *
 * OPPORTUNITY -> PAGE — the relationship made visible: one real,
 * most-recently-touched pair, context bridging the two.
 * -------------------------------------------------------------- */
function OpportunityToPage({ opportunity, page }: { opportunity: Opportunity; page: Page }) {
  return (
    <section>
      <SectionHeader eyebrow="From context to page" title="How an opportunity becomes a page" />
      <div className="mt-4 grid items-center gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link href="/opportunities" className="min-w-0 rounded-lg border border-border/60 bg-background/40 p-4 transition-colors hover:border-primary/40">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Opportunity</p>
          <p className="mt-2 truncate text-sm font-medium">{opportunity.title}</p>
          <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
            {opportunity.topic}
            {opportunity.targetIntent && <> · {opportunity.targetIntent}</>}
          </p>
        </Link>

        <div className="flex items-center justify-center py-2 text-muted-foreground sm:py-0">
          <div className="hidden h-px w-8 bg-border sm:block" />
          <ArrowRight className="size-4 shrink-0 rotate-90 sm:rotate-0" />
          <div className="hidden h-px w-8 bg-border sm:block" />
        </div>

        <Link href={`/pages/${page.id}`} className="min-w-0 rounded-lg border border-border/60 bg-background/40 p-4 transition-colors hover:border-primary/40">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Page</p>
          <p className="mt-2 truncate text-sm font-medium">{page.title ?? page.slug}</p>
          <p className="mt-1 truncate text-[12.5px] text-muted-foreground">/{page.slug} · {STAGE_META[page.status === "draft" ? "generating" : page.status === "ready" ? "review" : "published"]?.label ?? page.status}</p>
        </Link>
      </div>
    </section>
  )
}

function StreamRow({ event }: { event: StreamEvent }) {
  const meta = event.stage === "rejected" ? { label: "Needs rework", tone: "text-destructive" } : STAGE_META[event.stage]
  return (
    <li>
      <Link href={event.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary/40">
        <span className={`size-1.5 shrink-0 rounded-full ${meta.tone.replace("text-", "bg-")}`} />
        <span className={`w-24 shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] ${meta.tone}`}>{meta.label}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{event.title}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{timeAgo(event.at)}</span>
      </Link>
    </li>
  )
}

function PerformanceTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{detail}</p>
    </div>
  )
}

/* -------------------------------------------------------------- *
 * NEXT ACTION — one contextual, singular primary action. Real
 * Decision -> real ActionPlan -> real PolicyEngine read; the button
 * drives the same real decisions/:id -> decisions/:id/execute chain
 * the rest of the app uses — never a mock interaction. Kept compact
 * (a single row, not a detail card) so it reads as the one thing to
 * do next, not another report panel.
 * -------------------------------------------------------------- */
function NextActionBanner({ nextAction, onActed }: { nextAction: NextAction; onActed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { decision, plan, policy } = nextAction

  async function approveAndExecute() {
    setBusy(true)
    setError(null)
    try {
      const decideRes = await fetch(`/api/v1/intelligence/decisions/${decision.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) })
      if (!decideRes.ok) throw new Error((await decideRes.json().catch(() => null))?.error ?? "Approval failed.")
      const execRes = await fetch(`/api/v1/intelligence/decisions/${decision.id}/execute`, { method: "POST" })
      if (!execRes.ok) throw new Error((await execRes.json().catch(() => null))?.error ?? "Execution failed.")
      onActed()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusy(false)
    }
  }

  const verb = NEXT_ACTION_VERB[decision.action] ?? "Take this action"

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">Next</p>
        <p className="mt-1 truncate text-sm text-foreground">{decision.reason}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {plan.status === "unsupported" ? (
          <span className="text-[12.5px] text-warn">Not yet automatable: {plan.unsupportedReason}</span>
        ) : (
          <>
            <button onClick={approveAndExecute} disabled={busy} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy ? "Working…" : verb} <ArrowUpRight className="size-3.5" />
            </button>
            {!policy.allowed && <span className="hidden text-[12px] text-muted-foreground lg:inline">{policy.reason}</span>}
          </>
        )}
      </div>
      {error && <p className="flex items-center gap-2 text-[12.5px] text-destructive sm:basis-full"><CircleAlert className="size-3.5 shrink-0" /> {error}</p>}
    </section>
  )
}

function EmptyNote({ icon: Icon, title, body }: { icon: typeof Target; title: string; body: string }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed border-border px-5 py-6">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

function StatePanel({ icon: Icon, title, body }: { icon: typeof Target; title: string; body: string }) {
  return (
    <div className="mt-8 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
      <Icon className="size-5 text-primary" />
      <p className="mt-4 text-sm font-semibold">{title}</p>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

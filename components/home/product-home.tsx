"use client"

/* ================================================================== *
 * SEO INTELLIGENCE OVERVIEW (Phase UX-2) — the homepage, rebuilt around
 * docs/product-experience-reset.md's product thesis: this is a
 * programmatic SEO intelligence + contextual page generation platform,
 * not an AI workforce console. Every number and row on this page is
 * real, already-persisted data read from existing APIs
 * (lib/intelligence/mission.ts#buildMissionSnapshot(), /api/opportunities,
 * /api/pages, /api/projects/:id/websites) — nothing here is mocked,
 * hardcoded, or a fabricated statistic. A metric with no real data yet
 * renders as an honest empty state that explains what's missing and
 * what to do next, never a fake zero standing in for "unmeasured."
 *
 * Replaces the previous "AI workforce operations" framing (Workers,
 * Runs, Outputs, Events from lib/workforce/store.ts) entirely on this
 * page. That store and every page that still uses it are untouched —
 * this file alone stops reading it.
 * ================================================================== */

import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Clock3,
  Compass,
  FileText,
  Gauge,
  Globe,
  Sparkles,
  Target,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { TopNav } from "@/components/studio/top-nav"
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

const RISK_TONE: Record<string, string> = { low: "text-grow", medium: "text-warn", high: "text-destructive", critical: "text-destructive" }

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
      <main id="main-content" className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 lg:py-14">
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
 * FIRST RUN — no website connected yet. The next action is a
 * single, obvious CTA into the real website-connect flow already
 * built at /websites; this page does not duplicate that form.
 * -------------------------------------------------------------- */
function FirstRunState() {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">SEO Intelligence</p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Discover what should exist on your site — before you build it</h1>
      <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
        Connect a website and this platform reads your market, your entities, and real search demand — then tells you exactly which pages are worth creating, and why.
      </p>
      <Link href="/websites" className="mt-7 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
        Connect your website <ArrowRight className="size-4" />
      </Link>

      <div className="mt-16 grid gap-8 border-t border-border pt-10 sm:grid-cols-3">
        <FirstRunStep index={1} icon={Globe} title="Connect" body="Point the platform at your website. Nothing is crawled until you say so." />
        <FirstRunStep index={2} icon={Compass} title="Discover" body="Real entities, markets, and search intent are mapped from your site and its market — turned into scored, explainable opportunities." />
        <FirstRunStep index={3} icon={Sparkles} title="Create" body="Turn a real opportunity into a contextual page — researched, written, optimized, and measured." />
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
 * produced entities or opportunities yet. Shows each real website's
 * own real discoveryStatus, never a generic spinner with no state.
 * -------------------------------------------------------------- */
function DiscoveringState({ websites }: { websites: Website[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">SEO Intelligence</p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Reading your market</h1>
      <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">Once discovery finishes, real opportunities will appear here — scored and explained, ready to review.</p>

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

/* -------------------------------------------------------------- *
 * POPULATED OVERVIEW — the six-level hierarchy from the brief:
 * SEO signal -> opportunities -> what to do next -> pages ->
 * performance -> evidence/detail.
 * -------------------------------------------------------------- */
function Overview({ data, onActed }: { data: HomeData; onActed: () => void }) {
  const { snapshot, opportunities, pages } = data
  const readyOpportunities = opportunities.filter((o) => o.status === "discovered" || o.status === "qualified")
  const topOpportunities = [...opportunities].sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1)).slice(0, 5)
  const recentPages = [...pages].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)

  return (
    <div className="flex flex-col gap-14">
      {/* LEVEL 1 — the real signal, the aha moment */}
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">SEO Intelligence</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">What your search landscape is telling you</h1>
        <p className="mt-4 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">{opportunities.length} real opportunit{opportunities.length === 1 ? "y" : "ies"}</strong> discovered across{" "}
          <strong className="font-semibold text-foreground">{snapshot.knowledgeAuthority.entityCount} tracked entit{snapshot.knowledgeAuthority.entityCount === 1 ? "y" : "ies"}</strong>
          {readyOpportunities.length > 0 && (
            <>
              {" "}— <strong className="font-semibold text-foreground">{readyOpportunities.length}</strong> {readyOpportunities.length === 1 ? "is" : "are"} ready for you to review.
            </>
          )}
        </p>
      </header>

      {/* LEVEL 3 — what to do next (surfaced early: this is the most important single component) */}
      {data.nextAction && <NextActionPanel nextAction={data.nextAction} onActed={onActed} />}

      {/* LEVEL 2 — opportunities */}
      <section>
        <SectionHeader eyebrow="Opportunity" title="What's worth creating" href={opportunities.length > 0 ? "/opportunities" : undefined} />
        {topOpportunities.length === 0 ? (
          <EmptyNote icon={Target} title="No opportunities discovered yet" body="Real opportunities appear here once discovery finishes analyzing your market." />
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {topOpportunities.map((o) => <OpportunityRow key={o.id} opportunity={o} />)}
          </div>
        )}
      </section>

      {/* LEVEL 4 — pages / generation */}
      <section>
        <SectionHeader eyebrow="Generation" title="What's being created" />
        {recentPages.length === 0 ? (
          <EmptyNote icon={FileText} title="No pages created yet" body="Once you act on an opportunity, its real, generated page — researched, written, and optimized — will appear here." />
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">
              {snapshot.pageIntelligence.pageCount} page{snapshot.pageIntelligence.pageCount === 1 ? "" : "s"} created · {snapshot.pageIntelligence.publishedCount} live
              {snapshot.pageIntelligence.avgQualityScore != null && <> · avg. quality {snapshot.pageIntelligence.avgQualityScore}</>}
            </p>
            <div className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {recentPages.map((p) => <PageRow key={p.id} page={p} />)}
            </div>
          </>
        )}
      </section>

      {/* LEVEL 5 — performance */}
      <section>
        <SectionHeader eyebrow="Performance" title="Is it working" />
        {snapshot.organicGrowth ? (
          <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            <PerformanceTile label="Search clicks" value={snapshot.organicGrowth.totalClicks.toLocaleString()} detail={`${snapshot.organicGrowth.snapshotDays}-day window`} />
            <PerformanceTile label="Search impressions" value={snapshot.organicGrowth.totalImpressions.toLocaleString()} detail="Google Search Console" />
            <PerformanceTile label="AI citations" value={snapshot.aiVisibility.citationCount.toLocaleString()} detail={`${snapshot.aiVisibility.answerCount} AI answers checked`} />
          </div>
        ) : (
          <EmptyNote icon={Gauge} title="Performance not measured yet" body="Connect Google Search Console (Integrations) to see real clicks, impressions, and ranking movement once your pages are live." />
        )}
      </section>

      {/* LEVEL 6 — evidence / detail, de-emphasized */}
      <footer className="border-t border-border pt-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Evidence</p>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[12.5px] text-muted-foreground">
          <span>{snapshot.knowledgeAuthority.entityCount} entities tracked{snapshot.knowledgeAuthority.entitiesWithEvidencePct != null && <> · {snapshot.knowledgeAuthority.entitiesWithEvidencePct}% with real evidence</>}</span>
          <span>{snapshot.marketMomentum.risingTrendCount} of {snapshot.marketMomentum.totalTrendCount} tracked trends rising</span>
          {snapshot.informationGain.sampleCount > 0 && <span>{snapshot.informationGain.sampleCount} pages passed the information-gain check{snapshot.informationGain.blockedCount > 0 && <>, {snapshot.informationGain.blockedCount} blocked for thin content</>}</span>}
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

function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
  return (
    <Link href="/opportunities" className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{opportunity.title}</p>
        <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
          {opportunity.topic}
          {opportunity.targetIntent && <> · {opportunity.targetIntent}</>}
        </p>
      </div>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{opportunity.status.replaceAll("_", " ")}</span>
      <span className="w-14 shrink-0 text-right">
        <span className="block font-mono text-sm tabular-nums text-foreground">{opportunity.finalScore != null ? Math.round(opportunity.finalScore) : "—"}</span>
        <span className="block font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">score</span>
      </span>
    </Link>
  )
}

const PAGE_STATUS_TONE: Record<Page["status"], string> = { draft: "text-muted-foreground", quality_rejected: "text-destructive", ready: "text-warn", published: "text-grow" }

function PageRow({ page }: { page: Page }) {
  return (
    <Link href={`/pages/${page.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{page.title ?? page.slug}</p>
        <p className="mt-1 truncate text-[12.5px] text-muted-foreground">/{page.slug}</p>
      </div>
      <span className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] ${PAGE_STATUS_TONE[page.status]}`}>{page.status.replaceAll("_", " ")}</span>
      {page.qualityScore != null && (
        <span className="w-14 shrink-0 text-right">
          <span className="block font-mono text-sm tabular-nums text-foreground">{Math.round(page.qualityScore)}</span>
          <span className="block font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">quality</span>
        </span>
      )}
    </Link>
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
 * NEXT ACTION — the single most important component (§5 of the
 * brief). Real Decision -> real ActionPlan -> real PolicyEngine
 * read, and Approve & Execute drives the same real
 * decisions/:id -> decisions/:id/execute chain the rest of the app
 * uses — never a mock interaction.
 * -------------------------------------------------------------- */
function NextActionPanel({ nextAction, onActed }: { nextAction: NextAction; onActed: () => void }) {
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

  return (
    <section className="rounded-xl border border-primary/25 bg-card px-6 py-6 sm:px-7">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">What to do next</p>
      <h2 className="mt-2 text-xl font-semibold tracking-[-0.01em]">{decision.action.replaceAll("_", " ")}</h2>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{decision.reason}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{decision.expectedImpact}</p>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-muted-foreground">
        <span>Confidence <strong className="font-medium text-foreground">{Math.round(decision.confidence * 100)}%</strong></span>
        <span>Risk <strong className={`font-medium capitalize ${RISK_TONE[decision.risk]}`}>{decision.risk}</strong></span>
        <span>Based on <strong className="font-medium text-foreground">{decision.evidenceIds.length}</strong> real signal{decision.evidenceIds.length === 1 ? "" : "s"}</span>
      </div>

      {plan.status === "unsupported" ? (
        <p className="mt-5 text-[13px] text-warn">Not yet automatable: {plan.unsupportedReason}</p>
      ) : (
        <div className="mt-5 flex items-center gap-3">
          <button onClick={approveAndExecute} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? "Working…" : "Approve & create"} <ArrowUpRight className="size-3.5" />
          </button>
          {!policy.allowed && <span className="text-[12.5px] text-muted-foreground">{policy.reason}</span>}
        </div>
      )}
      {error && <p className="mt-3 flex items-center gap-2 text-[12.5px] text-destructive"><CircleAlert className="size-3.5 shrink-0" /> {error}</p>}
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

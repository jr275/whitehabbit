"use client"

/* Intelligence Timeline (Phase 8 §12-13, ADR-045) — the real,
 * event-based Signal -> Observation -> Decision -> Action -> Outcome
 * chain for this tenant, filterable server-side (type/entity/date
 * range/search all sent as query params to
 * /api/v1/intelligence/timeline — never fetched unfiltered and
 * narrowed in the browser, per §12/§24). Every entry links back to its
 * real underlying record when one exists; nothing here is synthetic
 * narrative text. */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CircleAlert, Clock3, Radar, Search, Sparkles, Target, ListChecks, PackageOpen } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { TimelineEntry, TimelineEntryType } from "@/lib/intelligence/timeline"

const TYPE_META: Record<TimelineEntryType, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  signal: { label: "Signal", icon: Radar, tone: "border-primary/40 bg-primary/10 text-primary" },
  observation: { label: "Observation", icon: Sparkles, tone: "border-accent/40 bg-accent/10 text-accent-foreground" },
  decision: { label: "Decision", icon: ListChecks, tone: "border-warn/40 bg-warn/10 text-warn" },
  action: { label: "Action", icon: Target, tone: "border-grow/40 bg-grow/10 text-grow" },
  outcome: { label: "Outcome", icon: PackageOpen, tone: "border-border bg-secondary text-muted-foreground" },
}

const ALL_TYPES: TimelineEntryType[] = ["signal", "observation", "decision", "action", "outcome"]

function entryHref(entry: TimelineEntry): string | null {
  if (entry.type === "decision") return "/intelligence/decisions"
  if (entry.type === "action") {
    const agentRunId = entry.detail.agentRunId as string | undefined
    return agentRunId ? `/agent-runs/${agentRunId}` : null
  }
  return null
}

function groupByDay(entries: TimelineEntry[]): { day: string; entries: TimelineEntry[] }[] {
  const groups = new Map<string, TimelineEntry[]>()
  for (const entry of entries) {
    const day = new Date(entry.at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(entry)
  }
  return Array.from(groups.entries()).map(([day, entries]) => ({ day, entries }))
}

export function IntelligenceTimelinePage() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTypes, setActiveTypes] = useState<Set<TimelineEntryType>>(new Set(ALL_TYPES))
  const [search, setSearch] = useState("")
  const [since, setSince] = useState("")
  const [until, setUntil] = useState("")

  useEffect(() => {
    fetch("/api/projects/default")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setProjectId(body?.project?.id ?? null))
      .catch(() => setError("Could not resolve the active project."))
  }, [])

  useEffect(() => {
    if (!projectId) return
    const params = new URLSearchParams({ projectId, limit: "200" })
    if (activeTypes.size > 0 && activeTypes.size < ALL_TYPES.length) params.set("types", Array.from(activeTypes).join(","))
    if (search.trim()) params.set("q", search.trim())
    if (since) params.set("since", String(new Date(since).getTime()))
    if (until) params.set("until", String(new Date(until).getTime() + 86_400_000 - 1))

    const controller = new AbortController()
    fetch(`/api/v1/intelligence/timeline?${params.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load the timeline."))))
      .then((body) => setEntries(body.entries))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err instanceof Error ? err.message : "Failed to load the timeline.")
      })
    return () => controller.abort()
  }, [projectId, activeTypes, search, since, until])

  const groups = useMemo(() => groupByDay(entries ?? []), [entries])

  function toggleType(t: TimelineEntryType) {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next.size === 0 ? new Set(ALL_TYPES) : next
    })
  }

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Intelligence Timeline</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">What happened, in order</h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Every real Signal, Observation, Decision, Action, and Outcome for this tenant, chronological — filtered server-side, never fetched in full and narrowed in the browser.
          </p>
        </header>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by event type">
            {ALL_TYPES.map((t) => {
              const meta = TYPE_META[t]
              const active = activeTypes.has(t)
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors ${active ? meta.tone : "border-border bg-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search summaries…"
                aria-label="Search timeline"
                className="h-8 w-48 rounded-md border border-border bg-background pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} aria-label="From date" className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="To date" className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>

        {error && <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" /> {error}</div>}

        <div className="mt-8 flex flex-col gap-8">
          {entries === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading real timeline events…</div>
          ) : groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">No real events match these filters yet.</p>
          ) : (
            groups.map((group) => (
              <section key={group.day}>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{group.day}</p>
                <ol className="mt-3 flex flex-col gap-2">
                  {group.entries.map((entry) => {
                    const meta = TYPE_META[entry.type]
                    const Icon = meta.icon
                    const href = entryHref(entry)
                    const content = (
                      <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40">
                        <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${meta.tone}`}>
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed text-foreground">{entry.summary}</p>
                          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                            {meta.label} · {new Date(entry.at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    )
                    return <li key={`${entry.type}:${entry.id}`}>{href ? <Link href={href}>{content}</Link> : content}</li>
                  })}
                </ol>
              </section>
            ))
          )}
        </div>
      </main>
    </div>
  )
}

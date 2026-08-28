"use client"

/* Real Opportunity Engine UI (§13) — reads live API data only, no mock
 * graph/opportunity data. Approve/reject/generate are real, audited,
 * tenant-scoped mutations. */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, CircleAlert, Clock3, XCircle } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { Opportunity, OpportunityStatus } from "@/lib/opportunity/model"
import { ObjectInspector, useObjectInspector } from "@/components/ontology/object-inspector"

const STATUS_TONE: Record<OpportunityStatus, string> = {
  discovered: "text-primary",
  qualified: "text-primary",
  approved: "text-grow",
  rejected: "text-destructive",
  generating: "text-warn",
  published: "text-grow",
  monitoring: "text-muted-foreground",
  stale: "text-muted-foreground",
  merged: "text-muted-foreground",
}

export function OpportunitiesList() {
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const inspector = useObjectInspector()

  async function load() {
    try {
      const res = await fetch("/api/opportunities")
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load opportunities.")
      const data = await res.json()
      setOpportunities(data.opportunities)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load opportunities.")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function act(id: string, action: "approved" | "rejected") {
    setPending(id)
    try {
      const res = await fetch(`/api/opportunities/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: action }) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Action failed.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Opportunity Engine</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">Opportunities</h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Real, scored opportunities discovered from your connected websites and Programmatic SEO workers — approve one to generate a page.
          </p>
        </header>

        {error && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <CircleAlert className="size-4 shrink-0" /> {error}
          </div>
        )}

        {opportunities === null ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4" /> Loading persisted opportunities…
          </div>
        ) : opportunities.length === 0 ? (
          <div className="mt-10 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No opportunities yet. Run website discovery, or execute a Programmatic SEO worker, to discover some.
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            {opportunities.map((opp) => (
              <article key={opp.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${STATUS_TONE[opp.status]}`}>{opp.status.replaceAll("_", " ")}</span>
                    <button onClick={() => inspector.open({ type: "opportunity", id: opp.id })} className="mt-1 block text-left text-lg font-semibold text-foreground hover:text-primary">
                      {opp.title}
                    </button>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {opp.opportunityType?.replaceAll("_", " ") ?? "programmatic seo"} · {opp.targetIntent ?? "no target intent recorded"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Score</p>
                      <p className="text-2xl font-semibold text-foreground">{opp.finalScore ?? "—"}</p>
                    </div>
                    <Link href={`/opportunities/${opp.id}`} title="Open full opportunity page" className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground">
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </div>
                {(opp.status === "discovered" || opp.status === "qualified") && (
                  <div className="mt-4 flex gap-2">
                    <button
                      disabled={pending === opp.id}
                      onClick={() => act(opp.id, "approved")}
                      className="flex items-center gap-1.5 rounded-md border border-grow/30 bg-grow/10 px-3 py-1.5 text-xs font-medium text-grow hover:bg-grow/20 disabled:opacity-50"
                    >
                      <CheckCircle2 className="size-3.5" /> Approve
                    </button>
                    <button
                      disabled={pending === opp.id}
                      onClick={() => act(opp.id, "rejected")}
                      className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      <XCircle className="size-3.5" /> Reject
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
      {inspector.isOpen && <ObjectInspector stack={inspector.stack} setStack={inspector.setStack} onClose={inspector.close} />}
    </div>
  )
}

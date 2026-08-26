"use client"

/* Website onboarding (§1/§9): Create Project (implicit — default
 * project) -> enter Website URL -> start Discovery. Real, persisted
 * Website rows only. */

import { useEffect, useState } from "react"
import Link from "next/link"
import { CircleAlert, Globe, Play } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { Website } from "@/lib/websites/model"

const DISCOVERY_TONE: Record<string, string> = {
  pending: "text-muted-foreground",
  discovering: "text-primary",
  discovered: "text-primary",
  crawling: "text-primary",
  crawled: "text-primary",
  analyzing: "text-primary",
  ready: "text-grow",
  failed: "text-destructive",
}

export function WebsitesPage() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [websites, setWebsites] = useState<Website[]>([])
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [discoveringId, setDiscoveringId] = useState<string | null>(null)

  async function loadWebsites(pid: string) {
    const res = await fetch(`/api/projects/${pid}/websites`)
    if (res.ok) setWebsites((await res.json()).websites)
  }

  useEffect(() => {
    fetch("/api/projects/default")
      .then((res) => res.json())
      .then((data) => {
        setProjectId(data.project.id)
        return loadWebsites(data.project.id)
      })
      .catch(() => setError("Could not load your project."))
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId || !url.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not connect website.")
      setUrl("")
      await loadWebsites(projectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect website.")
    } finally {
      setSubmitting(false)
    }
  }

  async function discover(websiteId: string) {
    if (!projectId) return
    setDiscoveringId(websiteId)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/websites/${websiteId}/discover`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Discovery failed.")
      await loadWebsites(projectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed.")
    } finally {
      setDiscoveringId(null)
    }
  }

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Website Discovery</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">Connect a website</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Enter a real website URL. Discovery runs a bounded, SSRF-safe crawl, builds a Knowledge Graph from what it finds, and discovers scored Opportunities — no data is fabricated.
        </p>

        <form onSubmit={connect} className="mt-6 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button disabled={submitting || !projectId} className="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50">
            {submitting ? "Connecting…" : "Connect"}
          </button>
        </form>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <CircleAlert className="size-4" /> {error}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {websites.map((site) => (
            <article key={site.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-muted-foreground" />
                  <Link href={`/websites/${site.id}`} className="font-medium text-foreground hover:text-primary">{site.hostname}</Link>
                </div>
                <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${DISCOVERY_TONE[site.discoveryStatus]}`}>{site.discoveryStatus}</span>
              </div>
              {site.discoveryError && <p className="mt-2 text-xs text-destructive">{site.discoveryError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  disabled={discoveringId === site.id || ["discovering", "discovered", "crawling", "crawled", "analyzing"].includes(site.discoveryStatus)}
                  onClick={() => discover(site.id)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  <Play className="size-3.5" /> {discoveringId === site.id ? "Running discovery…" : site.discoveryStatus === "ready" ? "Re-run discovery" : "Run discovery"}
                </button>
                <Link href={`/websites/${site.id}`} className="flex items-center rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  View knowledge profile →
                </Link>
              </div>
            </article>
          ))}
          {websites.length === 0 && <p className="text-sm text-muted-foreground">No websites connected yet.</p>}
        </div>
      </main>
    </div>
  )
}

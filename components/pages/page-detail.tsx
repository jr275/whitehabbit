"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CircleAlert, Clock3, Globe } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { Page, PageVersion } from "@/lib/pages/model"
import type { InternalLink } from "@/lib/internal-links/model"

interface PageResponse {
  page: Page
  version: PageVersion | null
  internalLinks: InternalLink[]
  artifacts: { type: string; content: unknown }[]
}

const STATUS_TONE: Record<string, string> = { draft: "text-muted-foreground", quality_rejected: "text-destructive", ready: "text-warn", published: "text-grow" }

export function PageDetail({ id }: { id: string }) {
  const [data, setData] = useState<PageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/pages/${id}`)
      if (!res.ok) throw new Error("Page not found.")
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load page.")
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  async function publish() {
    setPublishing(true)
    try {
      const res = await fetch(`/api/pages/${id}/publish`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Publish failed.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.")
    } finally {
      setPublishing(false)
    }
  }

  if (error) return <Shell><div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4" /> {error}</div></Shell>
  if (!data) return <Shell><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading…</div></Shell>

  const { page, version, internalLinks } = data

  return (
    <Shell>
      <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${STATUS_TONE[page.status]}`}>{page.status.replaceAll("_", " ")}</span>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{page.title ?? "Untitled page"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{page.metaDescription}</p>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <Stat label="Quality" value={page.qualityScore} />
        <Stat label="SEO" value={page.seoScore} />
        <Stat label="AEO" value={page.aeoScore} />
        <Stat label="GEO" value={page.geoScore} />
      </div>

      {page.rejectionReasons && page.rejectionReasons.length > 0 && (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-destructive">Quality gate rejected this draft</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-foreground/90">
            {page.rejectionReasons.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      )}

      {page.status === "ready" && (
        <button onClick={publish} disabled={publishing} className="mt-6 flex items-center gap-2 rounded-md border border-grow/30 bg-grow/10 px-4 py-2 text-sm font-medium text-grow hover:bg-grow/20 disabled:opacity-50">
          <Globe className="size-4" /> {publishing ? "Publishing…" : "Publish"}
        </button>
      )}
      {page.status === "published" && page.canonicalUrl && (
        <a href={page.canonicalUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <Globe className="size-4" /> View live page →
        </a>
      )}

      {version && (
        <section className="mt-8 flex flex-col gap-6">
          {version.content.sections.map((section, i) => (
            <div key={i}>
              <h2 className="text-xl font-semibold text-foreground">{section.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">{section.body}</p>
            </div>
          ))}
        </section>
      )}

      {internalLinks.length > 0 && (
        <section className="mt-8 rounded-xl border border-border bg-card p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Internal link recommendations</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground/90">
            {internalLinks.map((link) => (
              <li key={link.id}>
                {link.targetPageId ? <Link href={`/pages/${link.targetPageId}`} className="text-primary hover:underline">{link.reason}</Link> : link.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-card p-4 text-center">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value ?? "—"}</p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[800px] px-5 py-8 sm:px-8">
        <Link href="/opportunities" className="text-xs text-muted-foreground hover:text-foreground">← All opportunities</Link>
        <div className="mt-3">{children}</div>
      </main>
    </div>
  )
}

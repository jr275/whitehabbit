"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CircleAlert, Clock3 } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { Website } from "@/lib/websites/model"
import type { WebsiteKnowledgeProfile } from "@/lib/knowledge-profile/model"

export function WebsiteDetail({ id }: { id: string }) {
  const [website, setWebsite] = useState<Website | null>(null)
  const [profile, setProfile] = useState<WebsiteKnowledgeProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/websites/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Website not found.")
        return res.json()
      })
      .then((data) => {
        setWebsite(data.website)
        setProfile(data.knowledgeProfile)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load website."))
  }, [id])

  if (error) {
    return <Shell><div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4" /> {error}</div></Shell>
  }
  if (!website) {
    return <Shell><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading…</div></Shell>
  }

  return (
    <Shell>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{website.hostname}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{website.url} · discovery status <strong className="text-foreground">{website.discoveryStatus}</strong></p>

      {!profile ? (
        <p className="mt-6 text-sm text-muted-foreground">No Knowledge Profile yet — run discovery from the Websites list.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Site purpose (v{profile.version})</h2>
            <p className="mt-2 text-sm text-foreground/90">{profile.profile.sitePurpose ?? "Not confidently determined."}</p>
            <p className="mt-1 text-xs text-muted-foreground">Detected vertical: {profile.profile.detectedVertical ?? "unknown"} (confidence {Math.round(profile.confidence.detectedVertical * 100)}%)</p>
          </section>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            <Stat label="Pages crawled" value={String(profile.profile.domainSignals.pagesCrawled)} />
            <Stat label="Entity types" value={String(profile.profile.primaryEntityTypes.length)} />
            <Stat label="Markets" value={String(profile.profile.markets.length)} />
            <Stat label="Schema types" value={String(profile.profile.schemaTypes.length)} />
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Existing SEO structure</h2>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-foreground/90">
              <li>{profile.profile.existingSeoStructure.pagesWithTitle} pages with a title</li>
              <li>{profile.profile.existingSeoStructure.pagesWithDescription} with a description</li>
              <li>{profile.profile.existingSeoStructure.pagesWithCanonical} with a canonical</li>
              <li>{profile.profile.existingSeoStructure.pagesWithStructuredData} with structured data</li>
              <li>avg {profile.profile.existingSeoStructure.averageWordCount} words/page</li>
            </ul>
          </section>

          <Link href="/knowledge" className="text-sm text-primary hover:underline">Explore extracted entities →</Link>
          <Link href="/opportunities" className="text-sm text-primary hover:underline">View discovered opportunities →</Link>
        </div>
      )}
    </Shell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4 text-center">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[800px] px-5 py-8 sm:px-8">
        <Link href="/websites" className="text-xs text-muted-foreground hover:text-foreground">← All websites</Link>
        <div className="mt-3">{children}</div>
      </main>
    </div>
  )
}

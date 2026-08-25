"use client"

/* ================================================================== *
 * INTEGRATION HUB — /integrations. A dedicated product surface, not a
 * rename of /connections (which stays reachable for the raw
 * connect/disconnect action but is no longer the primary nav entry).
 * Every state shown here is real: GET /api/connectors (the code
 * catalog) joined with GET /api/system/health's real, org-scoped
 * `integrations` array — never inferred from the manifest alone.
 * ================================================================== */

import { AlertTriangle, CheckCircle2, Circle, Plug } from "lucide-react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import type { IntegrationHealth } from "@/app/api/system/health/route"
import type { IntegrationHealthState } from "@/lib/connectors/types"

interface ConnectorSummary {
  id: string
  name: string
  description: string
  provider: string
  category: string
  authenticationType: string
  actions: { id: string }[]
  triggers: { id: string }[]
  enabled: boolean
  oauthAuthorizeUrl?: string
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

type Bucket = "connected" | "needs_attention" | "available" | "not_configured"

function bucketFor(connector: ConnectorSummary, health: IntegrationHealthState | undefined): Bucket {
  if (health === "healthy") return "connected"
  if (health === "auth_error" || health === "rate_limited" || health === "error" || health === "degraded") return "needs_attention"
  return connector.enabled ? "available" : "not_configured"
}

const BUCKET_META: Record<Bucket, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "text-grow" },
  needs_attention: { label: "Needs attention", tone: "text-warn" },
  available: { label: "Available", tone: "text-primary" },
  not_configured: { label: "Not configured", tone: "text-muted-foreground" },
}

export function IntegrationHub() {
  const { status: sessionStatus } = useSession()
  const searchParams = useSearchParams()
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null)
  const [health, setHealth] = useState<IntegrationHealth[]>([])
  const [error, setError] = useState<string | null>(searchParams.get("error"))
  const [notice, setNotice] = useState<string | null>(searchParams.get("connected") ? `${searchParams.get("connected")} connected.` : null)

  async function refresh() {
    try {
      const [c, h] = await Promise.all([api<{ connectors: ConnectorSummary[] }>("/api/connectors"), api<{ integrations: IntegrationHealth[] }>("/api/system/health")])
      setConnectors(c.connectors)
      setHealth(h.integrations)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load integrations.")
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated") refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  if (sessionStatus !== "authenticated") {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 text-center sm:px-8">
        <p className="text-[14px] text-muted-foreground">Sign in to manage this organization&apos;s integrations.</p>
        <Link href="/login" className="mt-3 inline-block text-[13px] font-medium text-primary underline">
          Sign in
        </Link>
      </div>
    )
  }

  if (!connectors) {
    return <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Loading…</div>
  }

  const withBucket = connectors.map((c) => ({ connector: c, bucket: bucketFor(c, health.find((h) => h.id === c.id)?.state), health: health.find((h) => h.id === c.id) }))
  const order: Bucket[] = ["needs_attention", "connected", "available", "not_configured"]

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Integration Runtime</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Integration Hub</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        Every provider WhiteHabbit can connect to, and its real, live state — never inferred from the catalog alone.
      </p>

      {notice && (
        <p className="mt-4 rounded-lg border border-grow/30 bg-grow/5 px-3 py-2 text-[13px] text-grow">
          {notice}{" "}
          <button onClick={() => setNotice(null)} className="ml-2 underline">
            dismiss
          </button>
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          {error}{" "}
          <button onClick={() => setError(null)} className="ml-2 underline">
            dismiss
          </button>
        </p>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {order.map((bucket) => {
          const items = withBucket.filter((x) => x.bucket === bucket)
          if (items.length === 0) return null
          return (
            <section key={bucket}>
              <h2 className={`font-mono text-[11px] uppercase tracking-[0.2em] ${BUCKET_META[bucket].tone}`}>
                {BUCKET_META[bucket].label} · {items.length}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {items.map(({ connector, health: h }) => (
                  <ConnectorCard key={connector.id} connector={connector} health={h} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ConnectorCard({ connector, health }: { connector: ConnectorSummary; health?: IntegrationHealth }) {
  const bucket = bucketFor(connector, health?.state)
  return (
    <Link href={`/integrations/${connector.id.replace(/^connector_/, "")}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary">
            <Plug className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
          <h3 className="text-[14px] font-semibold text-foreground">{connector.name}</h3>
        </div>
        {bucket === "connected" ? (
          <CheckCircle2 className="h-4 w-4 text-grow" />
        ) : bucket === "needs_attention" ? (
          <AlertTriangle className="h-4 w-4 text-warn" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>
      <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{connector.description}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
        <span>{connector.category}</span>
        <span>·</span>
        <span>{connector.actions.length} actions</span>
        {health?.detail && <span className="truncate text-warn">· {health.detail}</span>}
      </div>
    </Link>
  )
}

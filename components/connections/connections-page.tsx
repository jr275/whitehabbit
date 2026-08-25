"use client"

/* ------------------------------------------------------------------ *
 * CONNECTIONS — minimal management UI for the Connector Foundation.
 *
 * Real backend state only: the connector catalog comes from
 * GET /api/connectors (lib/connectors/registry.ts, the actual code
 * catalog), and each connection's status comes from
 * GET /api/connections (real Postgres rows, org-scoped). No connector
 * ever shows CONNECTED without a real Connection row backing it, and
 * a disabled connector never gets a Connect button — see
 * app/api/connections/route.ts for the server-side enforcement this
 * UI reflects, never replaces.
 * ------------------------------------------------------------------ */

import { CheckCircle2, Circle, ChevronDown, Loader2, Plug, Radio } from "lucide-react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { StudioShell } from "@/components/studio/studio-shell"

interface ConnectorCapability {
  id: string
  label: string
  description: string
  permission: string
}

interface ConnectorAction {
  id: string
  label: string
  description: string
  permission: string
  riskLevel: string
}

interface ConnectorTrigger {
  id: string
  type: string
  label: string
  description: string
  eventName: string
  enabled: boolean
}

interface ConnectorSummary {
  id: string
  name: string
  description: string
  provider: string
  category: string
  authenticationType: string
  capabilities: ConnectorCapability[]
  actions: ConnectorAction[]
  triggers: ConnectorTrigger[]
  enabled: boolean
}

interface ConnectionSummary {
  id: string
  organizationId: string
  connectorId: string
  status: string
  authType: string
  displayName?: string
  createdAt: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

export function ConnectionsPage({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const { status: sessionStatus } = useSession()
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null)
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [category, setCategory] = useState("All")

  async function refresh() {
    try {
      const [c1, c2] = await Promise.all([api<{ connectors: ConnectorSummary[] }>("/api/connectors"), api<{ connections: ConnectionSummary[] }>("/api/connections")])
      setConnectors(c1.connectors)
      setConnections(c2.connections)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connections.")
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated") refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  async function handleConnect(connectorId: string) {
    setPendingId(connectorId)
    try {
      await api("/api/connections", { method: "POST", body: JSON.stringify({ connectorId }) })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect.")
    } finally {
      setPendingId(null)
    }
  }

  async function handleMcpSync() {
    setPendingId("connector_mcp")
    try {
      await api("/api/connectors/mcp/sync", { method: "POST" })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync MCP tools.")
    } finally {
      setPendingId(null)
    }
  }

  async function handleDisconnect(connectionId: string) {
    setPendingId(connectionId)
    try {
      await api(`/api/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE" })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <StudioShell runtimeMode={runtimeMode}>
      <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Connector Foundation</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Connections</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Real, per-organization connections to external services. A connector only shows Connected when a real connection exists — nothing here is
          simulated.
        </p>

        {sessionStatus !== "authenticated" ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-[14px] text-muted-foreground">Sign in to manage this organization&apos;s connections.</p>
            <Link href="/login" className="mt-3 inline-block text-[13px] font-medium text-primary underline">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</p>}
            {!connectors ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {["All", ...Array.from(new Set(connectors.map((c) => c.category))).sort()].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                        category === c ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {connectors
                  .filter((c) => category === "All" || c.category === category)
                  .map((connector) => {
                    const connection = connections.find((c) => c.connectorId === connector.id)
                    return (
                      <ConnectorRow
                        key={connector.id}
                        connector={connector}
                        connection={connection}
                        pending={pendingId}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                        onMcpSync={connector.id === "connector_mcp" ? handleMcpSync : undefined}
                      />
                    )
                  })}
              </>
            )}
          </div>
        )}
      </div>
    </StudioShell>
  )
}

function ConnectorRow({
  connector,
  connection,
  pending,
  onConnect,
  onDisconnect,
  onMcpSync,
}: {
  connector: ConnectorSummary
  connection: ConnectionSummary | undefined
  pending: string | null
  onConnect: (connectorId: string) => void
  onDisconnect: (connectionId: string) => void
  onMcpSync?: () => void
}) {
  const connected = connection?.status === "connected"
  const isPending = pending === connector.id || (connection && pending === connection.id)
  const [expanded, setExpanded] = useState(false)
  const hasDetail = connector.actions.length > 0 || connector.triggers.length > 0

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
            <Plug className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">{connector.name}</h2>
              {connected ? (
                <span className="flex items-center gap-1 rounded-full border border-grow/30 bg-grow/8 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-grow">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <Circle className="h-3 w-3" /> Not connected
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{connector.description}</p>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">Auth: {connector.authenticationType}</p>
            {connector.capabilities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {connector.capabilities.map((cap) => (
                  <span key={cap.id} className="rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground" title={cap.description}>
                    {cap.label} · {cap.permission}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onMcpSync ? (
            <button
              onClick={onMcpSync}
              disabled={!!isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Radio className="h-3.5 w-3.5" /> Sync tools
            </button>
          ) : !connector.enabled ? (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Authentication coming in a later phase</span>
          ) : connected && connection ? (
            <button
              onClick={() => onDisconnect(connection.id)}
              disabled={!!isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => onConnect(connector.id)}
              disabled={!!isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Connect
            </button>
          )}
        </div>
      </div>

      {hasDetail && (
        <div className="mt-3 border-t border-border pt-3">
          <button onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {connector.actions.length} action{connector.actions.length === 1 ? "" : "s"} · {connector.triggers.length} trigger{connector.triggers.length === 1 ? "" : "s"}
          </button>
          {expanded && (
            <div className="mt-2 flex flex-col gap-2">
              {connector.actions.length > 0 && (
                <div className="flex flex-col gap-1">
                  {connector.actions.map((a) => (
                    <div key={a.id} className="rounded-md border border-border bg-secondary/30 px-2.5 py-1.5">
                      <p className="font-mono text-[11px] font-medium text-foreground">
                        {a.label} <span className="text-muted-foreground">— {a.permission} · {a.riskLevel} risk</span>
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">{a.description}</p>
                    </div>
                  ))}
                </div>
              )}
              {connector.triggers.length > 0 && (
                <div className="flex flex-col gap-1">
                  {connector.triggers.map((t) => (
                    <div key={t.id} className="rounded-md border border-dashed border-border px-2.5 py-1.5">
                      <p className="font-mono text-[11px] font-medium text-foreground">
                        {t.label} <span className="text-muted-foreground">— {t.type} · {t.eventName}</span>
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">{t.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

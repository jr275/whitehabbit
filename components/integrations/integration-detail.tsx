"use client"

/* ================================================================== *
 * INTEGRATION DETAIL — /integrations/[id] (section "PHASE 3").
 * Overview / Connection / Actions / Triggers / Permissions /
 * Executions / Health — every field real, several genuinely empty for
 * a not-yet-connected provider rather than filled with a placeholder.
 * ================================================================== */

import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Plug } from "lucide-react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import type { IntegrationHealth } from "@/app/api/system/health/route"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

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
  actions: ConnectorAction[]
  triggers: ConnectorTrigger[]
  enabled: boolean
  oauthAuthorizeUrl?: string
}
interface ConnectionSummary {
  id: string
  connectorId: string
  status: string
  authType: string
  displayName?: string
  metadata?: Record<string, unknown>
  errorReason?: string
  createdAt: number
  updatedAt: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

export function IntegrationDetail({ id }: { id: string }) {
  const connectorId = id.startsWith("connector_") ? id : `connector_${id}`
  const { status: sessionStatus } = useSession()
  const { events } = useWorkforce()
  const [connector, setConnector] = useState<ConnectorSummary | null>(null)
  const [connection, setConnection] = useState<ConnectionSummary | undefined>(undefined)
  const [health, setHealth] = useState<IntegrationHealth | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      const [c, conns, h] = await Promise.all([
        api<{ connectors: ConnectorSummary[] }>("/api/connectors"),
        api<{ connections: ConnectionSummary[] }>("/api/connections"),
        api<{ integrations: IntegrationHealth[] }>("/api/system/health"),
      ])
      setConnector(c.connectors.find((x) => x.id === connectorId) ?? null)
      setConnection(conns.connections.find((x) => x.connectorId === connectorId))
      setHealth(h.integrations.find((x) => x.id === connectorId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this integration.")
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      workforceStore.hydrate()
      refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, connectorId])

  async function handleDisconnect() {
    if (!connection) return
    setBusy(true)
    try {
      if (connectorId === "connector_salesforce") {
        await api("/api/connectors/salesforce/disconnect", { method: "POST" })
      } else {
        await api(`/api/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE" })
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.")
    } finally {
      setBusy(false)
    }
  }

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ state: string; detail?: string } | null>(null)

  async function handleTestConnection() {
    if (!connection) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api<{ health: { state: string; detail?: string } }>(`/api/connections/${encodeURIComponent(connection.id)}/test`, { method: "POST" })
      setTestResult(res.health)
      await refresh()
    } catch (err) {
      setTestResult({ state: "error", detail: err instanceof Error ? err.message : "Test failed." })
    } finally {
      setTesting(false)
    }
  }

  if (sessionStatus !== "authenticated") {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 text-center sm:px-8">
        <Link href="/login" className="text-[13px] font-medium text-primary underline">
          Sign in
        </Link>
      </div>
    )
  }

  if (!connector) {
    return <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{error ?? "Loading…"}</div>
  }

  const connected = connection?.status === "connected"
  const relatedEvents = events
    .filter((e) => (e.type === "tool_called" || e.type === "tool_completed" || e.type === "tool_blocked") && String(e.payload.tool ?? "").startsWith(connector.id.replace("connector_", "connector_")))
    .slice(0, 20)

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8">
      <Link href="/integrations" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
        ← Integration Hub
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{connector.name}</h1>
            {connected ? (
              <span className="flex items-center gap-1 rounded-full border border-grow/30 bg-grow/8 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-grow">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <Plug className="h-3 w-3" /> Not connected
              </span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">{connector.description}</p>
        </div>
        <div>
          {connected ? (
            <button onClick={handleDisconnect} disabled={busy} className="rounded-full border border-border px-3.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary disabled:opacity-60">
              {busy && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
              Disconnect
            </button>
          ) : connector.oauthAuthorizeUrl ? (
            <a href={connector.oauthAuthorizeUrl} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">
              Connect {connector.name} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Authentication coming in a later phase</span>
          )}
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</p>}

      {/* OVERVIEW */}
      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Provider" value={connector.provider} />
          <Field label="Category" value={connector.category} />
          <Field label="Auth type" value={connector.authenticationType} />
          <Field label="Actions" value={String(connector.actions.length)} />
        </dl>
      </Section>

      {/* CONNECTION */}
      <Section title="Connection">
        {connection ? (
          <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
            <Row k="Status" v={connection.status} />
            {connection.displayName && <Row k="Account" v={connection.displayName} />}
            {typeof connection.metadata?.instanceUrl === "string" && connection.metadata.instanceUrl && <Row k="Instance URL" v={connection.metadata.instanceUrl} />}
            {typeof connection.metadata?.defaultPropertyId === "string" && connection.metadata.defaultPropertyId && <Row k="Default property" v={connection.metadata.defaultPropertyId} />}
            <Row k="Connected since" v={new Date(connection.createdAt).toLocaleString()} />
            {connection.errorReason && <Row k="Error" v={connection.errorReason} />}
          </dl>
        ) : (
          <p className="text-[13px] text-muted-foreground">No connection exists yet.</p>
        )}
        {/* "Connected" above is AUTHENTICATED — a stored, valid OAuth
         * credential. It is not proof the provider is reachable right
         * now (an expired/revoked token, an outage, a rate limit all
         * still read "connected" here) — that's what Health below,
         * from a real live call, actually verifies. */}
      </Section>

      {connectorId === "connector_google_analytics" && connected && <GoogleAnalyticsPropertyPicker connection={connection!} onSaved={refresh} />}

      {/* HEALTH */}
      <Section title="Health">
        <div className="flex flex-wrap items-center gap-3">
          {health ? (
            <div className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 ${health.state === "healthy" ? "border-grow/30 bg-grow/5" : health.state === "not_configured" ? "border-border bg-secondary/30" : "border-warn/30 bg-warn/5"}`}>
              {health.state === "healthy" ? <CheckCircle2 className="h-4 w-4 text-grow" /> : <AlertTriangle className="h-4 w-4 text-warn" />}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-foreground">{health.state.replace(/_/g, " ")}</p>
                {health.detail && <p className="text-[12px] text-muted-foreground">{health.detail}</p>}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No health data.</p>
          )}
          {connected && (
            <button onClick={handleTestConnection} disabled={testing} className="rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary disabled:opacity-60">
              {testing && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
              Test connection
            </button>
          )}
        </div>
        {testResult && (
          <p className={`mt-2 text-[12px] ${testResult.state === "healthy" ? "text-grow" : "text-warn"}`}>
            {testResult.state === "healthy" ? "Live check succeeded." : `Live check: ${testResult.state.replace(/_/g, " ")}${testResult.detail ? ` — ${testResult.detail}` : ""}`}
          </p>
        )}
      </Section>

      {/* ACTIONS + PERMISSIONS */}
      <Section title={`Actions & permissions (${connector.actions.length})`}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[500px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                {["Action", "Permission", "Risk"].map((h) => (
                  <th key={h} className="px-3 py-2 font-mono text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {connector.actions.map((a) => (
                <tr key={a.id} className="border-b border-border/70 last:border-b-0">
                  <td className="px-3 py-2 text-[12.5px] text-foreground" title={a.description}>
                    {a.label}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{a.permission}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{a.riskLevel}</td>
                </tr>
              ))}
              {connector.actions.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-[12.5px] text-muted-foreground">
                    No real actions declared for this connector yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* TRIGGERS */}
      <Section title={`Triggers (${connector.triggers.length})`}>
        {connector.triggers.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No real triggers declared for this connector yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {connector.triggers.map((t) => (
              <div key={t.id} className="rounded-md border border-dashed border-border px-3 py-2">
                <p className="font-mono text-[11.5px] font-medium text-foreground">
                  {t.label} <span className="text-muted-foreground">— {t.type} · {t.eventName}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t.description}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* EXECUTIONS */}
      <Section title="Recent executions">
        {relatedEvents.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No real calls to this integration yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {relatedEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[11.5px]">
                <span className="font-mono text-foreground">{e.type}</span>
                <span className="font-mono text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

/* GA4-only, section 5 of the vertical slice: "show connected
 * account/properties, allow default-property selection, evaluate
 * persisting it." Real data only — list_accounts is the connector's
 * own real GA4 Admin API action (POST /api/connections/[id]/actions/
 * list_accounts, restricted server-side to read-only actions), and
 * the real accountSummaries[].propertySummaries[] shape from that one
 * call already carries every property under every account this
 * credential can see — no second list_properties round trip needed.
 * Saving persists connection.metadata.defaultPropertyId via PATCH
 * (merged, not replacing other metadata) — additive, so a Worker/tool
 * call that doesn't pass an explicit propertyId could read this as a
 * fallback later without any backward-incompatible change today. */
interface GaPropertySummary {
  property: string
  displayName: string
}
interface GaAccountSummary {
  account: string
  displayName: string
  propertySummaries?: GaPropertySummary[]
}

function GoogleAnalyticsPropertyPicker({ connection, onSaved }: { connection: ConnectionSummary; onSaved: () => void }) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<GaAccountSummary[] | null>(null)
  const [selected, setSelected] = useState<string>(typeof connection.metadata?.defaultPropertyId === "string" ? connection.metadata.defaultPropertyId : "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function loadAccounts() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api<{ result: { ok: boolean; data?: { accountSummaries: GaAccountSummary[] }; error?: string } }>(`/api/connections/${encodeURIComponent(connection.id)}/actions/list_accounts`, { method: "POST", body: JSON.stringify({}) })
      if (!res.result.ok) throw new Error(res.result.error ?? "Could not list Google Analytics accounts.")
      setAccounts(res.result.data?.accountSummaries ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not list Google Analytics accounts.")
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await api(`/api/connections/${encodeURIComponent(connection.id)}`, { method: "PATCH", body: JSON.stringify({ metadata: { defaultPropertyId: selected } }) })
      setSaved(true)
      onSaved()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not save the default property.")
    } finally {
      setSaving(false)
    }
  }

  const properties = (accounts ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ ...p, accountName: a.displayName })))

  return (
    <Section title="Account & property">
      {accounts === null ? (
        <button onClick={loadAccounts} disabled={loading} className="rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary disabled:opacity-60">
          {loading && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
          Load Google Analytics accounts & properties
        </button>
      ) : properties.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">This Google identity has no GA4 accounts or properties it can access.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-[12.5px] text-foreground">
            <option value="">No default property</option>
            {properties.map((p) => (
              <option key={p.property} value={p.property.replace(/^properties\//, "")}>
                {p.accountName} — {p.displayName} ({p.property.replace(/^properties\//, "")})
              </option>
            ))}
          </select>
          <button onClick={save} disabled={saving} className="rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {saving && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
            Save as default
          </button>
          {saved && <span className="text-[12px] text-grow">Saved.</span>}
        </div>
      )}
      {loadError && <p className="mt-2 text-[12px] text-destructive">{loadError}</p>}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-foreground">{value}</dd>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-[12px] text-muted-foreground">{k}</dt>
      <dd className="truncate text-right font-mono text-[11.5px] text-foreground">{v}</dd>
    </div>
  )
}

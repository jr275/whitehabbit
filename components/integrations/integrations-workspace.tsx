"use client"

/* ------------------------------------------------------------------ *
 * INTEGRATIONS WORKSPACE — /integrations, main's canonical shell for
 * this surface. Rebuilt (connector platform reconciliation, post-
 * PR#34-merge) to be a REAL connector-management UI — the file
 * previously here was a read-only stub with no data path to
 * connectors at all ("Account selection, OAuth scopes, health checks,
 * and connect/disconnect mutations require a backend connector and
 * are not exposed here"). That backend already exists (the Dynamic/
 * Custom Connectors D1-D10 work); this file is what makes it reachable
 * from the canonical UI rather than only from the API.
 *
 * Data: GET /api/connectors (the merged built-in + custom catalog,
 * lib/connectors/registry.ts's listAllConnectors()) joined with
 * GET /api/system/health's real, org-scoped `integrations` array —
 * never inferred from the manifest alone. Built-in connectors keep
 * using the existing /integrations/[id] detail page (OAuth authorize/
 * disconnect/test — untouched by this rebuild) for their own
 * connect/manage flow; custom connectors get a real create/credential/
 * test/import-openapi/delete flow inline here, since no detail page
 * exists for them yet (that surface was deliberately API-only through
 * Fase D6 — this is what makes it self-service).
 * ------------------------------------------------------------------ */

import { AlertTriangle, CheckCircle2, Circle, Database, KeyRound, Loader2, Plug, PlugZap, Plus, Search, ShieldCheck, Trash2, Upload, X } from "lucide-react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { TopNav } from "@/components/studio/top-nav"
import type { IntegrationHealth } from "@/app/api/system/health/route"
import type { IntegrationHealthState } from "@/lib/connectors/types"

interface ConnectorActionSummary {
  id: string
  label: string
  permission: string
  riskLevel: string
}

interface ConnectorSummary {
  id: string
  name: string
  description: string
  provider: string
  category: string
  authenticationType: string
  actions: ConnectorActionSummary[]
  triggers: { id: string }[]
  enabled: boolean
  oauthAuthorizeUrl?: string
  origin?: "built-in" | "custom"
  /** Only meaningful for origin "custom" — mirrors CustomConnectorStatus. */
  status?: "not_connected" | "connected" | "error"
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

// The Internal Test Connector (connector_test) is dev/validation-only —
// never end-user-visible, filtered before bucketing/search/categories.
function isCustomerFacing(connector: ConnectorSummary): boolean {
  return connector.id !== "connector_test"
}

// Custom connector catalog ids are always "custom_<cconn-id>"
// (lib/connectors/custom-connector-id.ts's customConnectorConnectorId) —
// the actual /api/custom-connectors/[id] routes want the bare cconn id.
function customConnectorRouteId(catalogId: string): string {
  return catalogId.replace(/^custom_/, "")
}

type Bucket = "connected" | "needs_attention" | "available" | "coming_soon"

function bucketFor(connector: ConnectorSummary, health: IntegrationHealthState | undefined): Bucket {
  if (health === "healthy") return "connected"
  if (health === "auth_error" || health === "rate_limited" || health === "error" || health === "degraded") return "needs_attention"
  return connector.enabled ? "available" : "coming_soon"
}

const BUCKET_META: Record<Bucket, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "text-grow" },
  needs_attention: { label: "Needs attention", tone: "text-warn" },
  available: { label: "Available", tone: "text-primary" },
  coming_soon: { label: "Coming soon", tone: "text-muted-foreground" },
}

export function IntegrationsWorkspace({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const { status: sessionStatus } = useSession()
  const searchParams = useSearchParams()
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null)
  const [health, setHealth] = useState<IntegrationHealth[]>([])
  const [error, setError] = useState<string | null>(searchParams.get("error"))
  const [notice, setNotice] = useState<string | null>(searchParams.get("connected") ? `${searchParams.get("connected")} connected.` : null)
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [manageId, setManageId] = useState<string | null>(null)

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
    if (sessionStatus === "authenticated") void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  if (sessionStatus !== "authenticated") {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav runtimeMode={runtimeMode} />
        <main className="mx-auto max-w-[900px] px-5 py-10 text-center sm:px-8">
          <p className="text-sm text-muted-foreground">Sign in to manage this organization&apos;s integrations.</p>
          <Link href="/login" className="mt-3 inline-block text-sm font-medium text-primary underline">Sign in</Link>
        </main>
      </div>
    )
  }

  const customerFacing = (connectors ?? []).filter(isCustomerFacing)
  const categories = Array.from(new Set(customerFacing.map((c) => c.category))).sort()
  const filtered = customerFacing.filter((c) => {
    if (categoryFilter && c.category !== categoryFilter) return false
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) return false
    }
    return true
  })
  const withBucket = filtered.map((c) => ({ connector: c, bucket: bucketFor(c, health.find((h) => h.id === c.id)?.state), health: health.find((h) => h.id === c.id) }))
  const order: Bucket[] = ["needs_attention", "connected", "available", "coming_soon"]
  const connectedCount = customerFacing.filter((c) => bucketFor(c, health.find((h) => h.id === c.id)?.state) === "connected").length
  const customCount = customerFacing.filter((c) => c.origin === "custom").length
  const manageConnector = manageId ? customerFacing.find((c) => c.id === manageId) : undefined

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav runtimeMode={runtimeMode} />
      <main id="main-content" className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8">
        <header className="grid gap-8 border-b border-border pb-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-end">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary"><PlugZap className="size-3.5" />Enterprise connectors</div>
            <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Integration infrastructure</h1>
            <p className="mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Every provider WhiteHabbit can connect to, and its real, live state — built-in OAuth connectors and your own Custom REST/MCP connectors, side by side. Never inferred from the catalog alone.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            <Metric label="Catalog" value={String(customerFacing.length)} icon={Database} />
            <Metric label="Connected" value={String(connectedCount)} icon={CheckCircle2} />
            <Metric label="Custom" value={String(customCount)} icon={Plug} />
          </div>
        </header>

        {!connectors ? (
          <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading connector catalog</div>
        ) : (
          <>
            <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative max-w-lg flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <label htmlFor="integration-search" className="sr-only">Search integrations</label>
                <input id="integration-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connectors, providers, capabilities…" className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setCategoryFilter(null)} className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${categoryFilter === null ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>All</button>
                {categories.map((cat) => (
                  <button key={cat} onClick={() => setCategoryFilter(cat)} className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${categoryFilter === cat ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{cat}</button>
                ))}
                <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"><Plus className="size-3.5" />New custom connector</button>
              </div>
            </section>

            {notice && (
              <p className="mt-4 rounded-lg border border-grow/30 bg-grow/5 px-3 py-2 text-[13px] text-grow">
                {notice} <button onClick={() => setNotice(null)} className="ml-2 underline">dismiss</button>
              </p>
            )}
            {error && (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
                {error} <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
              </p>
            )}

            {withBucket.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-border py-20 text-center"><p className="text-sm font-medium">No connectors match this view</p><p className="mt-1 text-xs text-muted-foreground">Try another search or category.</p></div>
            ) : (
              <div className="mt-8 flex flex-col gap-8">
                {order.map((bucket) => {
                  const items = withBucket.filter((x) => x.bucket === bucket)
                  if (items.length === 0) return null
                  return (
                    <section key={bucket}>
                      <h2 className={`font-mono text-[11px] uppercase tracking-[0.2em] ${BUCKET_META[bucket].tone}`}>{BUCKET_META[bucket].label} · {items.length}</h2>
                      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {items.map(({ connector, health: h, bucket: b }) => (
                          <ConnectorCard key={connector.id} connector={connector} health={h} bucket={b} onManage={() => setManageId(connector.id)} />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {showCreate && (
        <CreateCustomConnectorModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            void refresh()
          }}
        />
      )}
      {manageConnector?.origin === "custom" && (
        <ManageCustomConnectorModal
          connector={manageConnector}
          onClose={() => setManageId(null)}
          onChanged={() => void refresh()}
          onDeleted={() => {
            setManageId(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Database }) {
  return (
    <div className="bg-card p-4">
      <Icon className="size-4 text-primary" />
      <p className="mt-4 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
    </div>
  )
}

function ConnectorCard({ connector, health, bucket, onManage }: { connector: ConnectorSummary; health?: IntegrationHealth; bucket: Bucket; onManage: () => void }) {
  const isCustom = connector.origin === "custom"
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary"><Plug className="h-3.5 w-3.5 text-muted-foreground" /></span>
          <h3 className="text-[14px] font-semibold text-foreground">{connector.name}</h3>
          {isCustom && <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Custom</span>}
        </div>
        {bucket === "connected" ? <CheckCircle2 className="h-4 w-4 text-grow" /> : bucket === "needs_attention" ? <AlertTriangle className="h-4 w-4 text-warn" /> : <Circle className="h-4 w-4 text-muted-foreground/50" />}
      </div>
      <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{connector.description}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
        <span>{connector.category}</span>
        <span>·</span>
        <span>{connector.actions.length} actions</span>
        {health?.detail && <span className="truncate text-warn">· {health.detail}</span>}
      </div>
    </>
  )

  // Custom connectors have no separate detail route — everything
  // (credential/test/import-openapi/delete) happens in the Manage
  // modal, opened right here, never a Link to a page that doesn't
  // exist for this connector kind.
  if (isCustom) {
    return (
      <button onClick={onManage} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40">
        {body}
      </button>
    )
  }
  return (
    <Link href={`/integrations/${connector.id.replace(/^connector_/, "")}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      {body}
    </Link>
  )
}

/* ==================================================================
 * CUSTOM CONNECTOR CREATE — POST /api/custom-connectors. Registers
 * only the definition (name/config); never a credential, never a
 * "connected" claim — that's ManageCustomConnectorModal's job, same
 * separation of concerns the API itself enforces server-side.
 * ================================================================== */
function CreateCustomConnectorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<"rest" | "mcp">("rest")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [icon, setIcon] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [authType, setAuthType] = useState<"none" | "api_key" | "bearer_token" | "basic_auth">("api_key")
  const [apiKeyHeader, setApiKeyHeader] = useState("")
  const [endpointUrl, setEndpointUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const config = kind === "rest" ? { baseUrl, authType, apiKeyHeader: authType === "api_key" && apiKeyHeader ? apiKeyHeader : undefined } : { endpointUrl }
      await api("/api/custom-connectors", {
        method: "POST",
        body: JSON.stringify({ kind, name, description: description || undefined, category: category || undefined, icon: icon || undefined, config }),
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the connector.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New custom connector" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Kind">
          <div className="flex gap-2">
            <button onClick={() => setKind("rest")} className={`flex-1 rounded-lg border px-3 py-2 text-[12px] ${kind === "rest" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>REST API</button>
            <button onClick={() => setKind("mcp")} className={`flex-1 rounded-lg border px-3 py-2 text-[12px] ${kind === "mcp" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>MCP server</button>
          </div>
        </Field>
        <Field label="Name"><Input value={name} onChange={setName} placeholder="Acme CRM" /></Field>
        <Field label="Description (optional)"><Input value={description} onChange={setDescription} placeholder="What this connector talks to" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category (optional)"><Input value={category} onChange={setCategory} placeholder="CRM" /></Field>
          <Field label="Icon (optional)"><Input value={icon} onChange={setIcon} placeholder="🧩" /></Field>
        </div>
        {kind === "rest" ? (
          <>
            <Field label="Base URL"><Input value={baseUrl} onChange={setBaseUrl} placeholder="https://api.example.com" /></Field>
            <Field label="Auth type">
              <select value={authType} onChange={(e) => setAuthType(e.target.value as typeof authType)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus:border-primary">
                <option value="none">None</option>
                <option value="api_key">API key</option>
                <option value="bearer_token">Bearer token</option>
                <option value="basic_auth">Basic auth</option>
              </select>
            </Field>
            {authType === "api_key" && <Field label="API key header (optional, defaults to X-API-Key)"><Input value={apiKeyHeader} onChange={setApiKeyHeader} placeholder="X-API-Key" /></Field>}
          </>
        ) : (
          <Field label="Endpoint URL"><Input value={endpointUrl} onChange={setEndpointUrl} placeholder="https://mcp.example.com/rpc" /></Field>
        )}
        {error && <p className="text-[12.5px] text-destructive">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={() => void submit()}
            disabled={submitting || !name.trim() || (kind === "rest" ? !baseUrl.trim() : !endpointUrl.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground disabled:opacity-40"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            Create connector
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ==================================================================
 * CUSTOM CONNECTOR MANAGE — credential / test / import-openapi /
 * delete, against the real D6 API routes. Never displays a credential
 * value — only ever asks for a new one to SET, matching the API's own
 * "never returned by any response" discipline.
 * ================================================================== */
function ManageCustomConnectorModal({ connector, onClose, onChanged, onDeleted }: { connector: ConnectorSummary; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const routeId = customConnectorRouteId(connector.id)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [credValues, setCredValues] = useState<Record<string, string>>({})
  const [savingCred, setSavingCred] = useState(false)
  const [credSaved, setCredSaved] = useState(false)
  const [spec, setSpec] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function runTest() {
    setTesting(true)
    setActionError(null)
    try {
      const res = await api<{ health: { ok: boolean; error?: string; latencyMs?: number } }>(`/api/custom-connectors/${routeId}/test`, { method: "POST" })
      setTestResult({ ok: res.health.ok, detail: res.health.error })
      onChanged()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Test failed.")
    } finally {
      setTesting(false)
    }
  }

  function buildCredentialPayload(): Record<string, string> | null {
    if (connector.authenticationType === "api_key") return { type: "api_key", value: credValues.value ?? "" }
    if (connector.authenticationType === "bearer_token") return { type: "bearer_token", token: credValues.token ?? "" }
    if (connector.authenticationType === "basic_auth") return { type: "basic_auth", username: credValues.username ?? "", password: credValues.password ?? "" }
    if (connector.authenticationType === "mcp") return { type: "mcp_bearer", token: credValues.token ?? "" }
    return null
  }

  async function saveCredential() {
    const credential = buildCredentialPayload()
    if (!credential) return
    setSavingCred(true)
    setActionError(null)
    setCredSaved(false)
    try {
      await api(`/api/custom-connectors/${routeId}/credential`, { method: "POST", body: JSON.stringify({ credential }) })
      setCredSaved(true)
      setCredValues({})
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save the credential.")
    } finally {
      setSavingCred(false)
    }
  }

  async function importOpenApi() {
    setImporting(true)
    setActionError(null)
    setImportResult(null)
    try {
      const res = await api<{ actionCount: number; warnings: string[] }>(`/api/custom-connectors/${routeId}/import-openapi`, { method: "POST", body: JSON.stringify({ spec }) })
      setImportResult(`Imported ${res.actionCount} action${res.actionCount === 1 ? "" : "s"}${res.warnings.length ? ` (${res.warnings.length} warning${res.warnings.length === 1 ? "" : "s"})` : ""}.`)
      onChanged()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Import failed.")
    } finally {
      setImporting(false)
    }
  }

  async function deleteConnector() {
    setDeleting(true)
    setActionError(null)
    try {
      await api(`/api/custom-connectors/${routeId}`, { method: "DELETE" })
      onDeleted()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete the connector.")
      setDeleting(false)
    }
  }

  const needsCredential = connector.authenticationType !== "none"

  return (
    <Modal title={connector.name} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{connector.category} · {connector.authenticationType}</span>
          <StatusPill status={connector.status ?? "not_connected"} />
        </div>

        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Test connection</p>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => void runTest()} disabled={testing} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] hover:border-primary/40 disabled:opacity-40">
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              Run a real check
            </button>
            {testResult && (
              <span className={`text-[12px] ${testResult.ok ? "text-grow" : "text-destructive"}`}>{testResult.ok ? "Reachable" : testResult.detail || "Unreachable"}</span>
            )}
          </div>
        </section>

        {needsCredential && (
          <section>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Credential — never shown once saved</p>
            <div className="mt-2 flex flex-col gap-2">
              {connector.authenticationType === "api_key" && <Input value={credValues.value ?? ""} onChange={(v) => setCredValues({ value: v })} placeholder="API key" type="password" />}
              {(connector.authenticationType === "bearer_token" || connector.authenticationType === "mcp") && <Input value={credValues.token ?? ""} onChange={(v) => setCredValues({ token: v })} placeholder="Bearer token" type="password" />}
              {connector.authenticationType === "basic_auth" && (
                <>
                  <Input value={credValues.username ?? ""} onChange={(v) => setCredValues((c) => ({ ...c, username: v }))} placeholder="Username" />
                  <Input value={credValues.password ?? ""} onChange={(v) => setCredValues((c) => ({ ...c, password: v }))} placeholder="Password" type="password" />
                </>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => void saveCredential()} disabled={savingCred} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40">
                  {savingCred ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                  Save credential
                </button>
                {credSaved && <span className="text-[12px] text-grow">Saved.</span>}
              </div>
            </div>
          </section>
        )}

        {connector.provider === "custom-rest" && (
          <section>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Import OpenAPI spec (JSON)</p>
            <textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={4} placeholder="Paste an OpenAPI 3.x document (JSON)…" className="mt-2 w-full rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] outline-none focus:border-primary" />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => void importOpenApi()} disabled={importing || !spec.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] hover:border-primary/40 disabled:opacity-40">
                {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Import
              </button>
              {importResult && <span className="text-[12px] text-grow">{importResult}</span>}
            </div>
          </section>
        )}

        {connector.actions.length > 0 && (
          <section>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Discovered actions · {connector.actions.length}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {connector.actions.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-1.5 text-[12px]">
                  <span className="truncate">{a.label}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{a.permission} · {a.riskLevel}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {actionError && <p className="text-[12.5px] text-destructive">{actionError}</p>}

        <section className="border-t border-border pt-4">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-muted-foreground">Delete this connector and its credentials?</span>
              <button onClick={() => void deleteConnector()} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-[12px] font-medium text-destructive-foreground disabled:opacity-40">
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Confirm delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-[12px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-[12px] text-destructive hover:underline">
              <Trash2 className="size-3.5" />
              Delete connector
            </button>
          )}
        </section>
      </div>
    </Modal>
  )
}

function StatusPill({ status }: { status: "not_connected" | "connected" | "error" }) {
  const meta = { connected: { label: "Connected", cls: "border-grow/30 bg-grow/10 text-grow" }, error: { label: "Error", cls: "border-destructive/30 bg-destructive/10 text-destructive" }, not_connected: { label: "Not connected", cls: "border-border bg-secondary text-muted-foreground" } }[status]
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus:border-primary" />
}

/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials, the
 * "external" server here is a real local HTTP server this test spins
 * up itself — fakes only the network edge, same pattern
 * test/failure-injection.test.ts already uses, never the policy
 * logic). Proves the dynamic-connector bridge (section 4/14 of the
 * connectivity platform brief): a real, org-added Custom REST
 * Connector genuinely calls out over real HTTP, with a real resolved
 * credential, through the exact same ToolDefinition/ToolAction shape
 * every static connector already produces.
 * ================================================================== */

import { createServer, type Server } from "node:http"
import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — dynamic connectors (Custom REST Connector)", () => {
  let server: Server
  let baseUrl: string
  let lastRequest: { path: string; method: string; headers: Record<string, string | string[] | undefined>; body: string } | null = null

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    server = createServer((req, res) => {
      let body = ""
      req.on("data", (chunk) => (body += chunk))
      req.on("end", () => {
        lastRequest = { path: req.url ?? "", method: req.method ?? "", headers: req.headers, body }
        res.setHeader("content-type", "application/json")
        if (req.url?.startsWith("/items/")) {
          res.end(JSON.stringify({ id: req.url.split("/items/")[1], received: body ? JSON.parse(body) : null }))
        } else {
          res.end(JSON.stringify({ ok: true, path: req.url }))
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    baseUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : ""
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it("the generic 'call' action makes a real HTTP request with the real resolved API-key credential", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Dynamic REST ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Test API", config: { baseUrl, authType: "api_key", apiKeyHeader: "X-Test-Key" } })
    await setCustomConnectorCredential(row.id, org.id, { type: "api_key", value: "real-secret-key-value" })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, { status: "connected" })

    const tools = buildDynamicConnectorTools(connected!)
    expect(tools).toHaveLength(1)
    const tool = tools[0]
    expect(tool.isConnected()).toBe(true)
    const callAction = tool.actions.find((a) => a.id === "call")!

    const result = await callAction.run({ method: "GET", path: "/ping", query: { foo: "bar" } }, { workerId: "w", executionId: "e", emit: () => {} })
    expect(result.ok).toBe(true)
    expect(lastRequest?.path).toBe("/ping?foo=bar")
    expect(lastRequest?.headers["x-test-key"]).toBe("real-secret-key-value")

    // The credential value is never echoed back in the tool result itself.
    expect(JSON.stringify(result)).not.toContain("real-secret-key-value")
  })

  it("a discovered (OpenAPI-imported) action does real path-parameter substitution and body handling", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Dynamic REST Discovered ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Items API", config: { baseUrl, authType: "none" } })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "update_item", label: "Update item", description: "", inputSchema: { id: { type: "string", description: "Item id", required: true }, name: { type: "string", description: "New name" } }, outputSchema: {}, permission: "write", riskLevel: "medium", httpMethod: "PUT", httpPath: "/items/{id}" }],
    })

    const tool = buildDynamicConnectorTools(connected!)[0]
    const action = tool.actions.find((a) => a.id === "update_item")!
    const result = await action.run({ id: "abc123", name: "New Name" }, { workerId: "w", executionId: "e", emit: () => {} })

    expect(result.ok).toBe(true)
    expect(lastRequest?.method).toBe("PUT")
    expect(lastRequest?.path).toBe("/items/abc123")
    expect(JSON.parse(lastRequest!.body)).toEqual({ name: "New Name" }) // "id" consumed by the path template, not duplicated in the body
  })

  it("organization isolation: a credential set for org A's custom connector is never readable via org B", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, getCustomConnectorCredential, listCustomConnectors } = await import("@/lib/db/repo")

    const orgA = await createOrganization(`Dynamic Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Dynamic Iso B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Iso API", config: { baseUrl, authType: "bearer_token" } })
    await setCustomConnectorCredential(row.id, orgA.id, { type: "bearer_token", token: "org-a-secret-token" })

    expect(await getCustomConnectorCredential(row.id, orgB.id)).toBeNull()
    expect(await listCustomConnectors(orgB.id)).toEqual([])

    const credA = await getCustomConnectorCredential(row.id, orgA.id)
    expect(credA).toEqual({ type: "bearer_token", token: "org-a-secret-token" })
  })

  it("a not-yet-connected custom connector produces tools that honestly report isConnected() === false", async () => {
    const { createOrganization, createCustomConnector } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Dynamic Not Connected ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Unset API", config: { baseUrl, authType: "none" } })
    expect(row.status).toBe("not_connected")
    expect(buildDynamicConnectorTools(row)).toEqual([]) // never builds tools for an unconnected custom connector
  })

  // Connector platform audit, Fase D5 — the BLOCKER: the generic "call"
  // action can issue ANY real HTTP method, so its declared permission/
  // riskLevel must be the most conservative one requiresApprovalByDefault()
  // (lib/workforce/model.ts) would ever need to gate on for a REST call
  // — proven here through the REAL server-side gate (runToolAction), not
  // just by reading the static fields.
  it("the generic 'call' action's declared permission/riskLevel always requires approval through the real gate, regardless of which HTTP method a given call actually uses", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")
    const { runToolAction } = await import("@/lib/agent/tool-runner")
    const { ApprovalRequiredError } = await import("@/lib/agent/types")

    const org = await createOrganization(`Dynamic Generic Call Risk ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Risk API", config: { baseUrl, authType: "none" } })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, { status: "connected" })
    const callAction = buildDynamicConnectorTools(connected!)[0].actions.find((a) => a.id === "call")!

    expect(callAction.permission).toBe("delete")
    expect(callAction.riskLevel).toBe("high")

    for (const method of ["GET", "POST", "DELETE"]) {
      await expect(runToolAction("custom.actions", "Risk API", callAction, { method, path: "/ping" }, { workerId: "w", executionId: "e", emit: () => {} })).rejects.toBeInstanceOf(ApprovalRequiredError)
    }
  })

  it("path traversal ('..') in the generic 'call' action's path is rejected before any request is sent", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Dynamic Path Traversal ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Traversal API", config: { baseUrl, authType: "none" } })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, { status: "connected" })
    const callAction = buildDynamicConnectorTools(connected!)[0].actions.find((a) => a.id === "call")!

    const before = lastRequest
    const result = await callAction.run({ method: "GET", path: "/../../etc/passwd" }, { workerId: "w", executionId: "e", emit: () => {} })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/\.\./)
    expect(lastRequest).toBe(before) // no request was ever actually sent
  })

  it("path traversal via a discovered action's substituted path parameter is also rejected", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Dynamic Path Param Traversal ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Items API 2", config: { baseUrl, authType: "none" } })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "get_item", label: "Get item", description: "", inputSchema: { id: { type: "string", description: "Item id", required: true } }, outputSchema: {}, permission: "read", riskLevel: "low", httpMethod: "GET", httpPath: "/items/{id}" }],
    })
    const action = buildDynamicConnectorTools(connected!)[0].actions.find((a) => a.id === "get_item")!
    const result = await action.run({ id: ".." }, { workerId: "w", executionId: "e", emit: () => {} })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/\.\./)
  })

  it("a caller-supplied header can never override the real resolved credential header (Authorization stays authoritative)", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Dynamic Header Collision ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Collision API", config: { baseUrl, authType: "bearer_token" } })
    await setCustomConnectorCredential(row.id, org.id, { type: "bearer_token", token: "the-real-token" })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, { status: "connected" })
    const callAction = buildDynamicConnectorTools(connected!)[0].actions.find((a) => a.id === "call")!

    await callAction.run({ method: "GET", path: "/ping", headers: { authorization: "Bearer attacker-supplied-value" } }, { workerId: "w", executionId: "e", emit: () => {} })
    expect(lastRequest?.headers["authorization"]).toBe("Bearer the-real-token")
  })

  it("SSRF: a custom connector configured against a private-network baseUrl is blocked before any request is attempted", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Dynamic SSRF ${randomUUID()}`)
    // A private-range address distinct from the loopback this whole
    // suite legitimately uses (see lib/security/ssrf-guard.ts's narrow,
    // Vitest-only loopback carve-out) — 10.x stays blocked unconditionally.
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "SSRF API", config: { baseUrl: "http://10.255.255.1", authType: "none" } })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, { status: "connected" })
    const callAction = buildDynamicConnectorTools(connected!)[0].actions.find((a) => a.id === "call")!

    const result = await callAction.run({ method: "GET", path: "/" }, { workerId: "w", executionId: "e", emit: () => {} })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/private|internal/i)
  })

  /* ================================================================ *
   * Fase D1 — contract normalization: slug/category/icon are real,
   * persisted fields, and updateCustomConnector() lets the definition
   * (name/description/category/icon/config) change after creation
   * without ever touching status/discoveredTools (a different repo
   * function's job) or the credential (a third, separate function).
   * ================================================================ */

  it("a new custom connector gets a real, stable, URL-safe slug derived from its name", async () => {
    const { createOrganization, createCustomConnector } = await import("@/lib/db/repo")
    const org = await createOrganization(`Slug ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Acme CRM — Café Ünïcode!", config: { baseUrl, authType: "none" } })
    expect(row.slug).toBe("acme-crm-cafe-unicode")
  })

  it("two different names that slugify to the same value get distinct slugs, never a collision (the pre-existing org+name unique constraint means only DIFFERENT names can reach the slug collision path at all)", async () => {
    const { createOrganization, createCustomConnector } = await import("@/lib/db/repo")
    const org = await createOrganization(`Slug Collision ${randomUUID()}`)
    const first = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Duplicate Name!", config: { baseUrl, authType: "none" } })
    const second = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Duplicate Name?", config: { baseUrl, authType: "none" } })
    expect(first.slug).toBe("duplicate-name")
    expect(second.slug).not.toBe(first.slug)
    expect(second.slug.startsWith("duplicate-name-")).toBe(true)
  })

  it("category and icon round-trip through creation exactly as given", async () => {
    const { createOrganization, createCustomConnector } = await import("@/lib/db/repo")
    const org = await createOrganization(`Category Icon ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Categorized API", category: "CRM", icon: "🧩", config: { baseUrl, authType: "none" } })
    expect(row.category).toBe("CRM")
    expect(row.icon).toBe("🧩")
  })

  it("updateCustomConnector changes name/description/category/icon/config without touching status or discoveredTools, and never crosses org boundaries", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnector, updateCustomConnectorDiscovery, getCustomConnector } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`Update A ${randomUUID()}`)
    const orgB = await createOrganization(`Update B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Original Name", description: "original desc", config: { baseUrl, authType: "none" } })
    await updateCustomConnectorDiscovery(row.id, orgA.id, { status: "connected" })
    const originalSlug = row.slug

    const updated = await updateCustomConnector(row.id, orgA.id, { name: "Renamed", description: "new desc", category: "CRM", icon: "🔧", config: { baseUrl, authType: "bearer_token" } })
    expect(updated?.name).toBe("Renamed")
    expect(updated?.description).toBe("new desc")
    expect(updated?.category).toBe("CRM")
    expect(updated?.icon).toBe("🔧")
    expect((updated?.config as { authType: string }).authType).toBe("bearer_token")
    // Renaming never regenerates the slug — it's a stable reference.
    expect(updated?.slug).toBe(originalSlug)
    // status/discoveredTools are a different function's job — untouched.
    expect(updated?.status).toBe("connected")

    // Cross-org: org B can never update org A's connector.
    const blocked = await updateCustomConnector(row.id, orgB.id, { name: "Hijacked" })
    expect(blocked).toBeNull()
    const stillOwnedByA = await getCustomConnector(row.id, orgA.id)
    expect(stillOwnedByA?.name).toBe("Renamed")
  })
})

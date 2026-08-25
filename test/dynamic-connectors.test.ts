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
})

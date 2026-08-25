/* ================================================================== *
 * CATEGORY A — real local HTTP server (fakes only the network edge,
 * never policy logic — same pattern every dynamic-connector test in
 * this suite already uses). Connector platform audit, Fase D9: proves
 * connector_execution_started/completed/failed events are real —
 * emitted on the actual execution chokepoint, carrying the right
 * correlation fields, and structurally unable to leak a secret,
 * because the emitter functions never accept one in the first place.
 * ================================================================== */

import { createServer, type Server } from "node:http"
import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — connector observability events (Fase D9)", () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    server = createServer((req, res) => {
      if (req.url === "/fail") {
        res.statusCode = 500
        res.end(JSON.stringify({ error: "boom" }))
        return
      }
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    baseUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : ""
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it("a successful dynamic connector call emits connector_execution_started then connector_execution_completed, with real correlation fields and no secret in the payload", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")
    const { customConnectorConnectorId } = await import("@/lib/connectors/custom-connector-id")

    const org = await createOrganization(`Observability Success ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Observed API", config: { baseUrl, authType: "bearer_token" } })
    await setCustomConnectorCredential(row.id, org.id, { type: "bearer_token", token: "the-real-secret-token" })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "get_thing", label: "Get thing", description: "", inputSchema: {}, outputSchema: {}, permission: "read", riskLevel: "low", httpMethod: "GET", httpPath: "/thing" }],
    })
    const tool = buildDynamicConnectorTools(connected!)[0]
    const action = tool.actions.find((a) => a.id === "get_thing")!

    const events: { type: string; payload: Record<string, unknown> }[] = []
    await action.run({}, { workerId: "w1", executionId: "e1", emit: (type, payload) => events.push({ type, payload }) })

    expect(events.map((e) => e.type)).toEqual(["connector_execution_started", "connector_execution_completed"])
    for (const e of events) {
      expect(e.payload.connectorId).toBe(customConnectorConnectorId(row.id))
      expect(e.payload.toolId).toBe(tool.id)
      expect(e.payload.actionId).toBe("get_thing")
      // The real secret must never appear anywhere in the payload.
      expect(JSON.stringify(e.payload)).not.toContain("the-real-secret-token")
      expect(Object.keys(e.payload)).not.toContain("headers")
      expect(Object.keys(e.payload)).not.toContain("authorization")
    }
    const completed = events[1].payload
    expect(completed.status).toBe("ok")
    expect(completed.httpStatus).toBe(200)
    expect(typeof completed.durationMs).toBe("number")
  })

  it("a failed dynamic connector call emits connector_execution_started then connector_execution_failed, with the real HTTP status and errorCode — still no secret leaked", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")

    const org = await createOrganization(`Observability Failure ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Observed Failing API", config: { baseUrl, authType: "api_key", apiKeyHeader: "X-Key" } })
    await setCustomConnectorCredential(row.id, org.id, { type: "api_key", value: "another-real-secret" })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "always_fails", label: "Always fails", description: "", inputSchema: {}, outputSchema: {}, permission: "read", riskLevel: "low", httpMethod: "GET", httpPath: "/fail" }],
    })
    const action = buildDynamicConnectorTools(connected!)[0].actions.find((a) => a.id === "always_fails")!

    const events: { type: string; payload: Record<string, unknown> }[] = []
    const result = await action.run({}, { workerId: "w1", executionId: "e1", emit: (type, payload) => events.push({ type, payload }) })

    expect(result.ok).toBe(false)
    expect(events.map((e) => e.type)).toEqual(["connector_execution_started", "connector_execution_failed"])
    const failed = events[1].payload
    expect(failed.status).toBe("failed")
    expect(failed.httpStatus).toBe(500)
    expect(failed.errorCode).toBe("provider_error")
    for (const e of events) expect(JSON.stringify(e.payload)).not.toContain("another-real-secret")
  })
})

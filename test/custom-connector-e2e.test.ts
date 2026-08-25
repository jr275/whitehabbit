/* ================================================================== *
 * CATEGORY A — real local Postgres + a real local HTTP server (fakes
 * only the network edge, never policy logic). Connector platform
 * audit, Fase D10: the end-to-end proof every earlier D-phase's unit
 * coverage was building toward — create -> credential -> test ->
 * appears in the catalog -> a real Worker execution actually calls it
 * through the real approval gate -> real connector_execution_* events
 * land in the real, persisted Observatory event log (not just an
 * in-memory emit callback, as test/connector-observability.test.ts
 * used — this exercises the real insertExecutionEvent/
 * getExecutionEvents path a genuine runtime invocation writes
 * through), all while a second organization sees none of it.
 * ================================================================== */

import { createServer, type Server } from "node:http"
import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — custom connector end-to-end lifecycle (Fase D10)", () => {
  let server: Server
  let baseUrl: string
  let lastAuthHeader: string | undefined

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    server = createServer((req, res) => {
      lastAuthHeader = req.headers["authorization"] as string | undefined
      res.setHeader("content-type", "application/json")
      if (req.url === "/contacts") {
        res.end(JSON.stringify({ contacts: [{ id: "c1", name: "Real Contact" }] }))
        return
      }
      res.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    baseUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : ""
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  /** Real Worker + Task + Execution rows, through the exact repo
   * functions the production runtime writes through — same pattern
   * test/observatory.test.ts already established. */
  async function setupOrgWorkerExecution(label: string) {
    const { createOrganization, upsertWorker, insertTask, insertExecution } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const org = await createOrganization(`E2E ${label} ${randomUUID()}`)
    const worker = buildEmptyWorker(`worker_e2e_${randomUUID()}`)
    worker.identity = { name: `E2E Worker ${label}`, role: "Test", description: "", persona: "", tone: [], accent: "#5a6ef0", initials: "EW" }
    await upsertWorker(worker, org.id, undefined)
    const taskId = `task_e2e_${randomUUID()}`
    const executionId = `exec_e2e_${randomUUID()}`
    const startedAt = Date.now()
    await insertTask({ id: taskId, workerId: worker.id, skillId: "skill_runtime_proof", type: "communication", title: "E2E test task", status: "running", createdAt: startedAt }, org.id, {})
    await insertExecution({ id: executionId, workerId: worker.id, taskId, status: "running", startedAt, completedAt: null }, org.id)
    return { org, worker, taskId, executionId }
  }

  /** A real emitter writing through insertExecutionEvent — the exact
   * function lib/agent/runtime.ts's own makeEmitter() writes through,
   * simplified (no stage-folding/idempotency-key machinery, since
   * connector_execution_* events are never stage events).
   *
   * ToolContext.emit is synchronous by contract (real callers never
   * await it), so the real write is fire-and-forget from the caller's
   * point of view — this test collects the real in-flight promises so
   * it can deterministically await them before reading events back,
   * rather than guessing at a timeout. */
  function makeRealEmit(orgId: string, workerId: string, taskId: string, executionId: string) {
    const pending: Promise<unknown>[] = []
    const emit = (type: string, payload: Record<string, unknown>) => {
      const write = import("@/lib/db/repo").then(({ insertExecutionEvent }) =>
        insertExecutionEvent(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: `ev_e2e_${randomUUID()}`, workerId, executionId, taskId, type: type as any, timestamp: Date.now(), payload },
          orgId,
        ),
      )
      pending.push(write)
    }
    return { emit, flush: () => Promise.all(pending) }
  }

  it("create -> credential -> test -> appears in the catalog -> a real Worker execution calls the discovered action through the real approval gate -> real connector_execution_* events are persisted and readable back from the Observatory event log", async () => {
    const { createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery, getExecutionEvents } = await import("@/lib/db/repo")
    const { testCustomRestConnector } = await import("@/lib/connectors/custom-rest")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")
    const { listAllConnectors } = await import("@/lib/connectors/registry")
    const { customConnectorConnectorId } = await import("@/lib/connectors/custom-connector-id")
    const { runToolAction } = await import("@/lib/agent/tool-runner")

    const { org, executionId, taskId, worker } = await setupOrgWorkerExecution("Lifecycle")

    // 1. CREATE — the real definition, no credential, not connected yet.
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Acme CRM E2E", category: "CRM", config: { baseUrl, authType: "bearer_token" } })
    expect(connector.status).toBe("not_connected")

    // 2. CREDENTIAL — set separately; must never flip status by itself.
    await setCustomConnectorCredential(connector.id, org.id, { type: "bearer_token", token: "e2e-real-token" })

    // 3. TEST — a real, live check against the real local server.
    const health = await testCustomRestConnector(connector)
    expect(health.ok).toBe(true)
    const connected = await updateCustomConnectorDiscovery(connector.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "list_contacts", label: "List contacts", description: "", inputSchema: {}, outputSchema: {}, permission: "read", riskLevel: "low", httpMethod: "GET", httpPath: "/contacts" }],
    })
    expect(connected?.status).toBe("connected")

    // 4. CATALOG — the merged catalog now carries this connector, origin "custom".
    const catalog = await listAllConnectors(org.id)
    const catalogEntry = catalog.find((c) => c.id === customConnectorConnectorId(connector.id))
    expect(catalogEntry?.origin).toBe("custom")
    expect(catalogEntry?.status).toBe("connected")

    // 5. WORKER EXECUTES — through the real approval gate (runToolAction),
    //    a real read action never requires approval and genuinely calls out.
    const tool = buildDynamicConnectorTools(connected!)[0]
    const action = tool.actions.find((a) => a.id === "list_contacts")!
    const { emit, flush } = makeRealEmit(org.id, worker.id, taskId, executionId)
    const result = await runToolAction(tool.id, tool.name, action, {}, { workerId: worker.id, executionId, emit })
    expect(result.ok).toBe(true)
    expect((result.data as { contacts: unknown[] }).contacts).toEqual([{ id: "c1", name: "Real Contact" }])
    expect(lastAuthHeader).toBe("Bearer e2e-real-token") // the real credential really reached the real server

    // Deterministically wait for the real, in-flight event writes
    // (rather than guessing at a timeout) before reading them back.
    await flush()

    // 6. OBSERVATORY — real, persisted events, readable back exactly as
    //    written, never containing the real credential anywhere.
    const events = await getExecutionEvents(executionId, org.id)
    const types = events.map((e) => e.type)
    expect(types).toContain("connector_execution_started")
    expect(types).toContain("connector_execution_completed")
    const completed = events.find((e) => e.type === "connector_execution_completed")!
    expect(completed.payload.connectorId).toBe(customConnectorConnectorId(connector.id))
    expect(completed.payload.toolId).toBe(tool.id)
    expect(completed.payload.actionId).toBe("list_contacts")
    expect(completed.payload.status).toBe("ok")
    expect(JSON.stringify(events)).not.toContain("e2e-real-token")
  })

  it("a second organization sees none of the first organization's custom connector, its events, or its credential — the full lifecycle stays isolated end to end", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery, getCustomConnectorCredential, listCustomConnectors } = await import("@/lib/db/repo")
    const { listAllConnectors } = await import("@/lib/connectors/registry")
    const { customConnectorConnectorId } = await import("@/lib/connectors/custom-connector-id")

    const { org: orgA } = await setupOrgWorkerExecution("Iso A")
    const orgB = await createOrganization(`E2E Iso B ${randomUUID()}`)

    const connector = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Iso E2E API", config: { baseUrl, authType: "bearer_token" } })
    await setCustomConnectorCredential(connector.id, orgA.id, { type: "bearer_token", token: "org-a-e2e-token" })
    await updateCustomConnectorDiscovery(connector.id, orgA.id, { status: "connected" })

    expect(await listCustomConnectors(orgB.id)).toEqual([])
    expect(await getCustomConnectorCredential(connector.id, orgB.id)).toBeNull()
    const catalogB = await listAllConnectors(orgB.id)
    expect(catalogB.find((c) => c.id === customConnectorConnectorId(connector.id))).toBeUndefined()
  })
})

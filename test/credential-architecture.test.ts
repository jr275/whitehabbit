/* ================================================================== *
 * CATEGORY A — real local Postgres + real local HTTP servers (fake
 * only the network edge, never policy logic — the same pattern every
 * dynamic-connector test in this suite already uses). Phase 2A/2B/2C
 * architectural hardening: proves the unified, connection-scoped
 * credential store (migrations/0013_connection_credentials.sql), its
 * explicit metadata/secret DTO split (lib/db/repo.ts's
 * CredentialMetadata vs. the decrypted CustomConnectorCredential), the
 * single resolveConnectionCredential() boundary (lib/connectors/
 * credential-resolver.ts), and the hardened OAuth isolation
 * (getOAuthCredential/deleteOAuthCredential now require and verify
 * orgId) all hold under real cross-org attack scenarios — not just
 * that the happy path works.
 * ================================================================== */

import { createServer, type Server } from "node:http"
import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Phase 2 — unified credential architecture", () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    server = createServer((_req, res) => {
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

  // 1. Cross-org credential isolation (connection-scoped store).
  it("1. cross-org isolation: org B can never read, list, or delete org A's connection credential, even with the real ids", async () => {
    const { createOrganization, createConnection, setConnectionCredential, getPrimaryConnectionCredential, listConnectionCredentials, deleteConnectionCredential } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`Phase2 Cred Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Phase2 Cred Iso B ${randomUUID()}`)
    const connection = await createConnection({ orgId: orgA.id, connectorId: "custom_phase2-iso-test", authType: "api_key", status: "not_connected" })
    const meta = await setConnectionCredential({ connectionId: connection.id, orgId: orgA.id, kind: "api_key", credential: { type: "api_key", value: "org-a-only-secret" } })

    expect(await getPrimaryConnectionCredential(connection.id, orgB.id)).toBeNull()
    expect(await listConnectionCredentials(connection.id, orgB.id)).toEqual([])
    await deleteConnectionCredential(meta.id, orgB.id) // must be a silent no-op
    expect(await getPrimaryConnectionCredential(connection.id, orgA.id)).toEqual({ type: "api_key", value: "org-a-only-secret" })
  })

  // 2. Credential metadata can be returned safely.
  it("2. CredentialMetadata is a real, safe DTO — id/label/kind/isPrimary/timestamps only, JSON-serializable with no secret substring", async () => {
    const { createOrganization, createConnection, setConnectionCredential, listConnectionCredentials } = await import("@/lib/db/repo")
    const org = await createOrganization(`Phase2 Metadata ${randomUUID()}`)
    const connection = await createConnection({ orgId: org.id, connectorId: "custom_phase2-metadata-test", authType: "api_key", status: "not_connected" })
    await setConnectionCredential({ connectionId: connection.id, orgId: org.id, kind: "bearer_token", credential: { type: "bearer_token", token: "super-secret-token-value" } })

    const list = await listConnectionCredentials(connection.id, org.id)
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe("Default")
    expect(list[0].kind).toBe("bearer_token")
    expect(list[0].isPrimary).toBe(true)
    expect(JSON.stringify(list[0])).not.toContain("super-secret-token-value")
    expect(Object.keys(list[0]).sort()).toEqual(["connectionId", "createdAt", "id", "isPrimary", "kind", "label", "updatedAt"])
  })

  // 3. Encrypted secrets can never appear in an API response — proven
  // at the exact shape every custom-connector route actually returns
  // (rowToCustomConnector / getCustomConnector), the same "no secret
  // in this object at all" discipline test/custom-connector-
  // credentials.test.ts already established for the plural summary.
  it("3. the object every custom-connector API route returns (getCustomConnector's CustomConnector) never carries the encrypted or decrypted secret, at any key, even after SELECT *", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, getCustomConnector } = await import("@/lib/db/repo")
    const org = await createOrganization(`Phase2 API Redaction ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Redaction API", config: { baseUrl: "https://example.test", authType: "api_key" } })
    await setCustomConnectorCredential(connector.id, org.id, { type: "api_key", value: "a-real-secret-that-must-never-leak" })

    const fetched = await getCustomConnector(connector.id, org.id)
    expect(fetched).not.toBeNull()
    expect(JSON.stringify(fetched)).not.toContain("a-real-secret-that-must-never-leak")
    expect(Object.keys(fetched as object)).not.toContain("credentialEncrypted")
    expect(Object.keys(fetched as object)).not.toContain("credential_encrypted")
  })

  // 4. Decrypted secrets cannot enter observability payloads.
  it("4. a real connector execution's connector.* observability events never carry the decrypted credential (real local server, real emit)", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")
    const org = await createOrganization(`Phase2 Observability ${randomUUID()}`)
    const SECRET = "observability-must-never-see-this-token"
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Phase2 Observed API", config: { baseUrl, authType: "bearer_token" } })
    await setCustomConnectorCredential(row.id, org.id, { type: "bearer_token", token: SECRET })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "ping", label: "Ping", description: "", inputSchema: {}, outputSchema: {}, permission: "read", riskLevel: "low", httpMethod: "GET", httpPath: "/ping" }],
    })
    const tool = buildDynamicConnectorTools(connected!)[0]
    const action = tool.actions.find((a) => a.id === "ping")!

    const events: { type: string; payload: Record<string, unknown> }[] = []
    const result = await action.run({}, { workerId: "w1", executionId: "e1", emit: (type, payload) => events.push({ type, payload }) })
    expect(result.ok).toBe(true)

    expect(events.map((e) => e.type)).toEqual(["connector_execution_started", "connector_execution_completed"])
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(SECRET)
    for (const e of events) {
      expect(Object.keys(e.payload)).not.toContain("headers")
      expect(Object.keys(e.payload)).not.toContain("authorization")
      expect(Object.keys(e.payload)).not.toContain("credential")
    }
  })

  // 5. Decrypted secrets cannot enter Worker outputs.
  it("5. a real WorkerOutput row built from a real connector-tool result never contains the decrypted credential, even round-tripped through insertOutput/listOutputsForExecution", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, updateCustomConnectorDiscovery, insertOutput, listOutputsForExecution, upsertWorker, insertTask, insertExecution } = await import("@/lib/db/repo")
    const { buildDynamicConnectorTools } = await import("@/lib/connectors/dynamic")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const org = await createOrganization(`Phase2 Output Redaction ${randomUUID()}`)

    // Real Worker/Task/Execution rows — outputs.worker_id/task_id/
    // execution_id are real FKs, matching the pattern test/custom-
    // connector-e2e.test.ts's setupOrgWorkerExecution() established.
    const worker = buildEmptyWorker(`worker_phase2_${randomUUID()}`)
    worker.identity = { name: "Phase 2 Output Worker", role: "Test", description: "", persona: "", tone: [], accent: "#5a6ef0", initials: "P2" }
    await upsertWorker(worker, org.id, undefined)
    const taskId = `task_phase2_${randomUUID()}`
    const executionId = `exec_phase2_${randomUUID()}`
    await insertTask({ id: taskId, workerId: worker.id, skillId: "skill_runtime_proof", type: "communication", title: "Phase 2 output redaction task", status: "running", createdAt: Date.now() }, org.id, {})
    await insertExecution({ id: executionId, workerId: worker.id, taskId, status: "running", startedAt: Date.now(), completedAt: null }, org.id)

    const SECRET = "worker-output-must-never-see-this-token"
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Phase2 Output API", config: { baseUrl, authType: "bearer_token" } })
    await setCustomConnectorCredential(row.id, org.id, { type: "bearer_token", token: SECRET })
    const connected = await updateCustomConnectorDiscovery(row.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "ping", label: "Ping", description: "", inputSchema: {}, outputSchema: {}, permission: "read", riskLevel: "low", httpMethod: "GET", httpPath: "/ping" }],
    })
    const tool = buildDynamicConnectorTools(connected!)[0]
    const action = tool.actions.find((a) => a.id === "ping")!
    const result = await action.run({}, { workerId: worker.id, executionId, emit: () => undefined })
    expect(result.ok).toBe(true)

    // Exactly the shape lib/agent/runtime.ts's finishSuccessfulRun
    // builds a WorkerOutput from — the real tool result folded into
    // `structured`, never a credential passed in separately.
    const outputId = `out_phase2_${randomUUID()}`
    await insertOutput(
      { id: outputId, workerId: worker.id, taskId, executionId, type: "connector_call", title: "Phase 2 output redaction proof", content: "ok", structured: result.data, status: "completed", createdAt: Date.now() },
      org.id,
    )

    const outputs = await listOutputsForExecution(executionId, org.id)
    expect(outputs).toHaveLength(1)
    expect(JSON.stringify(outputs)).not.toContain(SECRET)
  })

  // 6. Credential resolution follows one authoritative path.
  it("6. resolveConnectionCredential is the sole resolution boundary — an oauth2 Connection routes through the oauth branch, everything else through the generic connection_credentials store", async () => {
    const { createOrganization, createConnection, setConnectionCredential } = await import("@/lib/db/repo")
    const { storeTokens } = await import("@/lib/connectors/token-store")
    const { resolveConnectionCredential } = await import("@/lib/connectors/credential-resolver")
    const org = await createOrganization(`Phase2 Single Path ${randomUUID()}`)

    // oauth2 branch.
    const oauthConn = await createConnection({ orgId: org.id, connectorId: "connector_test_oauth", authType: "oauth2", status: "connected" })
    await storeTokens(oauthConn.id, { accessToken: `real-token-${randomUUID()}`, expiresAt: Date.now() + 3600_000 })
    const config = { authorizeUrl: "https://example.test/auth", tokenUrl: "https://example.test/token", clientId: "x", clientSecret: "y", redirectUri: "https://example.test/callback", scope: "read" }
    const oauthResolved = await resolveConnectionCredential(oauthConn, { oauthConfig: config })
    expect(oauthResolved?.kind).toBe("oauth2")

    // generic branch — same function, same call shape; only the
    // Connection's authType changes which storage the answer came from.
    const apiKeyConn = await createConnection({ orgId: org.id, connectorId: "custom_single-path-test", authType: "api_key", status: "not_connected" })
    await setConnectionCredential({ connectionId: apiKeyConn.id, orgId: org.id, kind: "api_key", credential: { type: "api_key", value: "single-path-secret" } })
    const genericResolved = await resolveConnectionCredential(apiKeyConn)
    expect(genericResolved?.kind).toBe("generic")
    expect(genericResolved).toEqual({ kind: "generic", credential: { type: "api_key", value: "single-path-secret" } })

    // Calling resolveConnectionCredential on an oauth2 Connection
    // WITHOUT oauthConfig throws rather than silently falling back to
    // the generic store — proves there's no hidden second path that
    // quietly guesses at a different answer.
    await expect(resolveConnectionCredential(oauthConn)).rejects.toThrow(/oauthConfig/)
  })

  // 7. A connection cannot resolve another organization's credential.
  it("7. resolveConnectionCredential trusts only the Connection object's own organizationId — a forged org claim on a real connection resolves nothing", async () => {
    const { createOrganization, createConnection, setConnectionCredential, getConnection } = await import("@/lib/db/repo")
    const { resolveConnectionCredential } = await import("@/lib/connectors/credential-resolver")
    const orgA = await createOrganization(`Phase2 Resolver Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Phase2 Resolver Iso B ${randomUUID()}`)
    const connA = await createConnection({ orgId: orgA.id, connectorId: "custom_resolver-iso-test", authType: "api_key", status: "not_connected" })
    await setConnectionCredential({ connectionId: connA.id, orgId: orgA.id, kind: "api_key", credential: { type: "api_key", value: "org-a-resolver-secret" } })

    // A forged Connection object claiming org B's id but org A's real
    // connection id — resolveConnectionCredential must use the
    // Connection's OWN organizationId, so this must resolve nothing.
    const real = await getConnection(connA.id, orgA.id)
    const forged = { ...real!, organizationId: orgB.id }
    expect(await resolveConnectionCredential(forged)).toBeNull()

    // The real, unforged org A Connection object still resolves correctly.
    expect(await resolveConnectionCredential(real!)).toEqual({ kind: "generic", credential: { type: "api_key", value: "org-a-resolver-secret" } })
  })

  it("7b. OAuth credential reads/deletes are org-verified at the repo layer (Phase 2C) — a wrong orgId with the real connectionId returns/deletes nothing", async () => {
    const { createOrganization, createConnection, getOAuthCredential, deleteOAuthCredential } = await import("@/lib/db/repo")
    const { storeTokens } = await import("@/lib/connectors/token-store")
    const orgA = await createOrganization(`Phase2 OAuth Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Phase2 OAuth Iso B ${randomUUID()}`)
    const connection = await createConnection({ orgId: orgA.id, connectorId: "connector_test_oauth_iso", authType: "oauth2", status: "connected" })
    await storeTokens(connection.id, { accessToken: `oauth-iso-token-${randomUUID()}` })

    expect(await getOAuthCredential(connection.id, orgB.id)).toBeNull()
    await deleteOAuthCredential(connection.id, orgB.id) // must be a silent no-op
    expect(await getOAuthCredential(connection.id, orgA.id)).not.toBeNull()
  })

  // 8. Existing custom connector behavior remains intact.
  it("8. existing custom connector behavior is unchanged: create -> setCustomConnectorCredential -> getCustomConnectorCredential round-trips exactly as before Phase 2A, upsert semantics preserved", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, getCustomConnectorCredential, listCustomConnectorCredentials } = await import("@/lib/db/repo")
    const org = await createOrganization(`Phase2 Compat ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Compat API", config: { baseUrl: "https://example.test", authType: "bearer_token" } })

    await setCustomConnectorCredential(connector.id, org.id, { type: "bearer_token", token: "compat-token-v1" })
    expect(await getCustomConnectorCredential(connector.id, org.id)).toEqual({ type: "bearer_token", token: "compat-token-v1" })

    // Setting again overwrites (upsert semantics — the original
    // 1:1-column function's behavior), never errors, never
    // accumulates a duplicate "Default" row.
    await setCustomConnectorCredential(connector.id, org.id, { type: "bearer_token", token: "compat-token-v2" })
    expect(await getCustomConnectorCredential(connector.id, org.id)).toEqual({ type: "bearer_token", token: "compat-token-v2" })
    const list = await listCustomConnectorCredentials(connector.id, org.id)
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe("Default")
  })

  it("8b. createCustomConnectorCredential still rejects a duplicate label with a real thrown error — rotation-table semantics, distinct from the upsert-only default slot", async () => {
    const { createOrganization, createCustomConnector, createCustomConnectorCredential } = await import("@/lib/db/repo")
    const org = await createOrganization(`Phase2 Dup Label ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Dup Label API 2", config: { baseUrl: "https://example.test", authType: "api_key" } })
    await createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Production", credential: { type: "api_key", value: "one" } })
    await expect(createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Production", credential: { type: "api_key", value: "two" } })).rejects.toThrow()
  })

  it("8c. the custom-connector -> connection sequencing gap is closed: setCustomConnectorCredential works BEFORE any test has ever run, and the mirrored Connection it creates is picked up by the very next POST .../test", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, getConnectionByConnectorId, ensureConnectionForCustomConnector } = await import("@/lib/db/repo")
    const { customConnectorConnectorId } = await import("@/lib/connectors/custom-connector-id")
    const org = await createOrganization(`Phase2 Sequencing ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Sequencing API", config: { baseUrl, authType: "bearer_token" } })

    // No Connection exists yet — credential-set must not fail.
    expect(await getConnectionByConnectorId(org.id, customConnectorConnectorId(connector.id))).toBeNull()
    await setCustomConnectorCredential(connector.id, org.id, { type: "bearer_token", token: "sequencing-token" })

    // A real, not_connected mirrored Connection now exists.
    const mirrored = await getConnectionByConnectorId(org.id, customConnectorConnectorId(connector.id))
    expect(mirrored?.status).toBe("not_connected")

    // ensureConnectionForCustomConnector (what POST .../test calls) is
    // idempotent — it returns the SAME row, never a duplicate.
    const again = await ensureConnectionForCustomConnector(org.id, undefined, connector.id, connector.name)
    expect(again.id).toBe(mirrored!.id)
  })
})

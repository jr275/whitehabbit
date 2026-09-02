/* ================================================================== *
 * CATEGORY A — pure DB-backed test, no external network. Connector
 * platform audit, Fase D2: proves the new credential-separation
 * infrastructure (migrations/0012_custom_connector_credentials.sql)
 * is real — multiple labeled credentials per Custom Connector, doubly
 * org+connector-scoped, never leaking a decrypted or encrypted value
 * through the summary shape — and that connections.connector_id's
 * existing free-TEXT column already supports multiple Connections per
 * Custom Connector with zero schema change, via the "custom_<id>"
 * naming convention (lib/connectors/custom-connector-id.ts).
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — custom connector credentials (Fase D2)", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
  })

  it("a custom connector can hold more than one labeled credential, each round-tripping exactly", async () => {
    const { createOrganization, createCustomConnector, createCustomConnectorCredential, getCustomConnectorCredentialValue } = await import("@/lib/db/repo")
    const org = await createOrganization(`Multi-cred ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Acme ERP", config: { baseUrl: "https://example.test", authType: "bearer_token" } })

    const prod = await createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Production", credential: { type: "bearer_token", token: "prod-token" } })
    const staging = await createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Staging", credential: { type: "bearer_token", token: "staging-token" } })

    expect(prod.id).not.toBe(staging.id)
    const prodValue = await getCustomConnectorCredentialValue(prod.id, connector.id, org.id)
    const stagingValue = await getCustomConnectorCredentialValue(staging.id, connector.id, org.id)
    expect(prodValue).toEqual({ type: "bearer_token", token: "prod-token" })
    expect(stagingValue).toEqual({ type: "bearer_token", token: "staging-token" })
  })

  it("listCustomConnectorCredentials returns only real metadata — never the encrypted or decrypted secret value", async () => {
    const { createOrganization, createCustomConnector, createCustomConnectorCredential, listCustomConnectorCredentials } = await import("@/lib/db/repo")
    const org = await createOrganization(`List Meta ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Metadata API", config: { baseUrl: "https://example.test", authType: "api_key" } })
    await createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Only", credential: { type: "api_key", value: "super-secret-value" } })

    const list = await listCustomConnectorCredentials(connector.id, org.id)
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe("Only")
    expect(JSON.stringify(list[0])).not.toContain("super-secret-value")
    expect(Object.keys(list[0]).sort()).toEqual(["createdAt", "customConnectorId", "id", "label", "updatedAt"])
  })

  it("two credentials on the same connector must have distinct labels (the unique index is real, not just documented)", async () => {
    const { createOrganization, createCustomConnector, createCustomConnectorCredential } = await import("@/lib/db/repo")
    const org = await createOrganization(`Dup Label ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Dup Label API", config: { baseUrl: "https://example.test", authType: "api_key" } })
    await createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Production", credential: { type: "api_key", value: "one" } })
    await expect(createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Production", credential: { type: "api_key", value: "two" } })).rejects.toThrow()
  })

  it("organization isolation: org B can never read, list, or delete org A's custom connector credential, even with the real id", async () => {
    const { createOrganization, createCustomConnector, createCustomConnectorCredential, getCustomConnectorCredentialValue, listCustomConnectorCredentials, deleteCustomConnectorCredential } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Iso B ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Iso API", config: { baseUrl: "https://example.test", authType: "bearer_token" } })
    const cred = await createCustomConnectorCredential({ customConnectorId: connector.id, orgId: orgA.id, label: "Default", credential: { type: "bearer_token", token: "org-a-secret" } })

    // Wrong org, right connector+credential id — must still fail.
    expect(await getCustomConnectorCredentialValue(cred.id, connector.id, orgB.id)).toBeNull()
    expect(await listCustomConnectorCredentials(connector.id, orgB.id)).toEqual([])
    await deleteCustomConnectorCredential(cred.id, orgB.id) // must be a silent no-op, never throw, never delete
    expect(await getCustomConnectorCredentialValue(cred.id, connector.id, orgA.id)).toEqual({ type: "bearer_token", token: "org-a-secret" })
  })

  it("creating a credential for a connector another org owns fails honestly, never silently attaching to the wrong org", async () => {
    const { createOrganization, createCustomConnector, createCustomConnectorCredential } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`Wrong Parent A ${randomUUID()}`)
    const orgB = await createOrganization(`Wrong Parent B ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Parent API", config: { baseUrl: "https://example.test", authType: "api_key" } })
    await expect(createCustomConnectorCredential({ customConnectorId: connector.id, orgId: orgB.id, label: "Default", credential: { type: "api_key", value: "x" } })).rejects.toThrow(/not found/i)
  })

  it("deleting a custom connector cascades to its credentials (ON DELETE CASCADE — no orphaned encrypted rows left behind)", async () => {
    const { createOrganization, createCustomConnector, createCustomConnectorCredential, deleteCustomConnector, listCustomConnectorCredentials } = await import("@/lib/db/repo")
    const org = await createOrganization(`Cascade ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Cascade API", config: { baseUrl: "https://example.test", authType: "api_key" } })
    await createCustomConnectorCredential({ customConnectorId: connector.id, orgId: org.id, label: "Default", credential: { type: "api_key", value: "x" } })
    await deleteCustomConnector(connector.id, org.id)
    expect(await listCustomConnectorCredentials(connector.id, org.id)).toEqual([])
  })

  it("the existing connections table already supports MULTIPLE real Connections for one Custom Connector, via the custom_<id> convention — no schema change needed", async () => {
    const { createOrganization, createCustomConnector, createConnection, listConnections } = await import("@/lib/db/repo")
    const { customConnectorConnectorId, parseCustomConnectorId } = await import("@/lib/connectors/custom-connector-id")
    const org = await createOrganization(`Multi-connection ${randomUUID()}`)
    const connector = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Acme ERP 2", config: { baseUrl: "https://example.test", authType: "bearer_token" } })
    const connectorId = customConnectorConnectorId(connector.id)

    const production = await createConnection({ orgId: org.id, connectorId, authType: "bearer_token", status: "connected", displayName: "Acme ERP — Production" })
    const staging = await createConnection({ orgId: org.id, connectorId, authType: "bearer_token", status: "connected", displayName: "Acme ERP — Staging" })

    expect(production.id).not.toBe(staging.id)
    const all = await listConnections(org.id)
    const forThisConnector = all.filter((c) => c.connectorId === connectorId)
    expect(forThisConnector).toHaveLength(2)
    expect(forThisConnector.map((c) => c.displayName).sort()).toEqual(["Acme ERP — Production", "Acme ERP — Staging"])
    expect(parseCustomConnectorId(connectorId)).toBe(connector.id)
    expect(parseCustomConnectorId("connector_salesforce")).toBeNull()
  })
})

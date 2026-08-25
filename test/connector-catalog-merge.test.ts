/* ================================================================== *
 * CATEGORY A — pure DB-backed test, no external network. Connector
 * platform audit, Fase D7: proves listAllConnectors() (lib/connectors/
 * registry.ts) is a real merge — every built-in connector plus this
 * org's own real custom connectors, correctly org-scoped, correctly
 * origined, with no id collision — the function GET /api/connectors
 * actually calls, not a re-implemented shortcut.
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — connector catalog merge (Fase D7)", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
  })

  it("includes every built-in connector plus this org's own custom connectors, correctly origined", async () => {
    const { createOrganization, createCustomConnector } = await import("@/lib/db/repo")
    const { listAllConnectors } = await import("@/lib/connectors/registry")
    const { customConnectorConnectorId } = await import("@/lib/connectors/custom-connector-id")

    const org = await createOrganization(`Catalog Merge ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Merged API", category: "CRM", config: { baseUrl: "https://example.test", authType: "none" } })

    const all = await listAllConnectors(org.id)
    const builtinEntry = all.find((c) => c.id === "connector_salesforce")
    const customEntry = all.find((c) => c.id === customConnectorConnectorId(row.id))

    expect(builtinEntry?.origin).toBe("built-in")
    expect(customEntry).toBeDefined()
    expect(customEntry?.origin).toBe("custom")
    expect(customEntry?.name).toBe("Merged API")
    expect(customEntry?.category).toBe("CRM")
    expect(customEntry?.status).toBe("not_connected")
  })

  it("never includes another organization's custom connectors", async () => {
    const { createOrganization, createCustomConnector } = await import("@/lib/db/repo")
    const { listAllConnectors } = await import("@/lib/connectors/registry")
    const { customConnectorConnectorId } = await import("@/lib/connectors/custom-connector-id")

    const orgA = await createOrganization(`Catalog Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Catalog Iso B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Org A Only API", config: { baseUrl: "https://example.test", authType: "none" } })

    const listB = await listAllConnectors(orgB.id)
    expect(listB.find((c) => c.id === customConnectorConnectorId(row.id))).toBeUndefined()
  })

  it("no id collision between any built-in connector and a custom connector's prefixed id", async () => {
    const { createOrganization, createCustomConnector } = await import("@/lib/db/repo")
    const { listAllConnectors } = await import("@/lib/connectors/registry")

    const org = await createOrganization(`Catalog Collision ${randomUUID()}`)
    await createCustomConnector({ orgId: org.id, kind: "rest", name: "Collision Check API", config: { baseUrl: "https://example.test", authType: "none" } })

    const all = await listAllConnectors(org.id)
    const ids = all.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("a custom connector's summary excludes the generic 'call' action — only real, described discovered actions are exposed for Worker Studio's per-action grid", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { listAllConnectors } = await import("@/lib/connectors/registry")
    const { customConnectorConnectorId } = await import("@/lib/connectors/custom-connector-id")

    const org = await createOrganization(`Catalog Actions ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: org.id, kind: "rest", name: "Actions API", config: { baseUrl: "https://example.test", authType: "none" } })
    await updateCustomConnectorDiscovery(row.id, org.id, {
      status: "connected",
      discoveredTools: [{ id: "list_things", label: "List things", description: "", inputSchema: {}, outputSchema: {}, permission: "read", riskLevel: "low" }],
    })

    const all = await listAllConnectors(org.id)
    const entry = all.find((c) => c.id === customConnectorConnectorId(row.id))!
    expect(entry.actions.map((a) => a.id)).toEqual(["list_things"])
    expect(entry.actions.some((a) => a.id === "call")).toBe(false)
  })
})

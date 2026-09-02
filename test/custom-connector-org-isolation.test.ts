/* ================================================================== *
 * CATEGORY A — pure DB-backed test, no external network. Connector
 * platform audit, Fase D4: a dedicated, exhaustive proof of cross-org
 * isolation for custom connectors specifically — create/list/get/
 * update/delete/execute/credential, all negative. Earlier phases
 * (D1/D2/D3/D5) each proved isolation incidentally for the one thing
 * they touched; this file is the "prove it on purpose" pass the audit
 * asked for, in one place, rather than isolation coverage being
 * scattered and implicit across unrelated test files.
 *
 * No code change is expected to come out of this file — every
 * repo.ts function already scopes by (id, org_id) or (org_id) alone
 * (confirmed by direct reading during the audit); this is the
 * automated proof that reading was correct, in the same category-A,
 * real-Postgres style every other test in this suite already uses.
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — custom connector organization isolation (Fase D4)", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
  })

  it("READ: org B's getCustomConnector never returns org A's row, even with the real id", async () => {
    const { createOrganization, createCustomConnector, getCustomConnector } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`D4 Get A ${randomUUID()}`)
    const orgB = await createOrganization(`D4 Get B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Get Iso API", config: { baseUrl: "https://example.test", authType: "none" } })

    expect(await getCustomConnector(row.id, orgB.id)).toBeNull()
    expect(await getCustomConnector(row.id, orgA.id)).not.toBeNull()
  })

  it("LIST: org B's listCustomConnectors never includes org A's rows", async () => {
    const { createOrganization, createCustomConnector, listCustomConnectors } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`D4 List A ${randomUUID()}`)
    const orgB = await createOrganization(`D4 List B ${randomUUID()}`)
    await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "List Iso API", config: { baseUrl: "https://example.test", authType: "none" } })
    await createCustomConnector({ orgId: orgB.id, kind: "rest", name: "Own API", config: { baseUrl: "https://example.test", authType: "none" } })

    const listB = await listCustomConnectors(orgB.id)
    expect(listB.map((r) => r.name)).toEqual(["Own API"])
  })

  it("UPDATE: org B's updateCustomConnector/updateCustomConnectorDiscovery are no-ops (return null) against org A's row, which stays unchanged", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnector, updateCustomConnectorDiscovery, getCustomConnector } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`D4 Update A ${randomUUID()}`)
    const orgB = await createOrganization(`D4 Update B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Update Iso API", config: { baseUrl: "https://example.test", authType: "none" } })

    expect(await updateCustomConnector(row.id, orgB.id, { name: "Hijacked" })).toBeNull()
    expect(await updateCustomConnectorDiscovery(row.id, orgB.id, { status: "connected" })).toBeNull()

    const stillA = await getCustomConnector(row.id, orgA.id)
    expect(stillA?.name).toBe("Update Iso API")
    expect(stillA?.status).toBe("not_connected")
  })

  it("DELETE: org B's deleteCustomConnector against org A's row is a silent no-op — the row survives, untouched", async () => {
    const { createOrganization, createCustomConnector, deleteCustomConnector, getCustomConnector } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`D4 Delete A ${randomUUID()}`)
    const orgB = await createOrganization(`D4 Delete B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Delete Iso API", config: { baseUrl: "https://example.test", authType: "none" } })

    await expect(deleteCustomConnector(row.id, orgB.id)).resolves.not.toThrow()
    expect(await getCustomConnector(row.id, orgA.id)).not.toBeNull()

    // The real delete, by the real owning org, does work — proving the
    // no-op above was org-scoping, not a broken delete altogether.
    await deleteCustomConnector(row.id, orgA.id)
    expect(await getCustomConnector(row.id, orgA.id)).toBeNull()
  })

  it("CREDENTIAL: org B can never decrypt org A's single-credential-per-row secret (custom_connectors.credential_encrypted), even with the real connector id", async () => {
    const { createOrganization, createCustomConnector, setCustomConnectorCredential, getCustomConnectorCredential } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`D4 Cred A ${randomUUID()}`)
    const orgB = await createOrganization(`D4 Cred B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Cred Iso API", config: { baseUrl: "https://example.test", authType: "api_key" } })
    await setCustomConnectorCredential(row.id, orgA.id, { type: "api_key", value: "org-a-only-secret" })

    expect(await getCustomConnectorCredential(row.id, orgB.id)).toBeNull()
    // Org B setting a credential against org A's row must be a no-op,
    // never overwriting org A's real secret.
    await setCustomConnectorCredential(row.id, orgB.id, { type: "api_key", value: "attacker-value" })
    expect(await getCustomConnectorCredential(row.id, orgA.id)).toEqual({ type: "api_key", value: "org-a-only-secret" })
  })

  it("EXECUTE: a Worker in org B never sees a tool built from org A's connected custom connector — toolsMapForOrg(orgB) has no path to it, by construction, not by a runtime check that could be bypassed", async () => {
    const { createOrganization, createCustomConnector, updateCustomConnectorDiscovery } = await import("@/lib/db/repo")
    const { toolsMapForOrg } = await import("@/lib/agent/tools/connector-tools")

    const orgA = await createOrganization(`D4 Execute A ${randomUUID()}`)
    const orgB = await createOrganization(`D4 Execute B ${randomUUID()}`)
    const row = await createCustomConnector({ orgId: orgA.id, kind: "rest", name: "Execute Iso API", config: { baseUrl: "https://example.test", authType: "none" } })
    await updateCustomConnectorDiscovery(row.id, orgA.id, { status: "connected" })

    const mapA = await toolsMapForOrg(orgA.id)
    const mapB = await toolsMapForOrg(orgB.id)

    const expectedToolId = `custom_${row.id}.actions`
    expect(mapA.has(expectedToolId)).toBe(true)
    expect(mapB.has(expectedToolId)).toBe(false)
    // Not merely absent by id — org B's map has no entry whose
    // underlying id references org A's row at all.
    expect([...mapB.keys()].some((id) => id.includes(row.id))).toBe(false)
  })
})

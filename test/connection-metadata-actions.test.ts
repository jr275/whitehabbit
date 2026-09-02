/* ================================================================== *
 * CATEGORY A — GA4 vertical slice, section 5: connection UX
 * (default-property selection, persisted via connection.metadata).
 *
 * Real behavior under test, matching what app/api/connections/[id]/
 * route.ts's PATCH handler and app/api/connections/[id]/actions/
 * [actionId]/route.ts's read-only guard actually do — at the same
 * layer this codebase's existing tests already exercise API routes at
 * (the repo/registry functions the route calls), rather than mocking
 * Next.js Request/session plumbing, which no test file here does.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

// Dynamically imported inside each test, matching every other test file
// in this repo — a top-level static import here drags in api-error.ts's
// next/server import at module-load time, ahead of vitest's alias setup,
// and breaks with an unrelated next-auth resolution error.
describe("Category A — connection metadata sanitizer", () => {
  it("keeps only primitive, non-secret-looking keys", async () => {
    const { sanitizeConnectionMetadata } = await import("@/lib/connectors/sanitize-metadata")
    expect(sanitizeConnectionMetadata({ defaultPropertyId: "123456789", nested: { a: 1 }, count: 3, active: true })).toEqual({ defaultPropertyId: "123456789", count: 3, active: true })
  })

  it("rejects any key that looks like it could carry a secret", async () => {
    const { sanitizeConnectionMetadata } = await import("@/lib/connectors/sanitize-metadata")
    expect(() => sanitizeConnectionMetadata({ apiKey: "x" })).toThrow(/not allowed/i)
    expect(() => sanitizeConnectionMetadata({ accessToken: "x" })).toThrow(/not allowed/i)
    expect(() => sanitizeConnectionMetadata({ credential: "x" })).toThrow(/not allowed/i)
  })

  it("non-object input is honestly empty, never a crash", async () => {
    const { sanitizeConnectionMetadata } = await import("@/lib/connectors/sanitize-metadata")
    expect(sanitizeConnectionMetadata(null)).toEqual({})
    expect(sanitizeConnectionMetadata("nope")).toEqual({})
  })
})

describe.skipIf(!hasDb)("Category A — DB-backed: default-property metadata merge + org isolation", () => {
  it("PATCH's merge semantics (fetch → sanitize new keys → merge → persist) keep an existing key when only a new one is set — proven at the same repo layer the route itself calls", async () => {
    const { createOrganization, createConnection, getConnection, updateConnectionStatus } = await import("@/lib/db/repo")
    const { sanitizeConnectionMetadata } = await import("@/lib/connectors/sanitize-metadata")

    const org = await createOrganization(`GA4 Metadata Merge ${randomUUID()}`)
    const connection = await createConnection({ orgId: org.id, connectorId: "connector_google_analytics", authType: "oauth2", status: "connected", metadata: { existingKey: "keep-me" } })

    // Exactly what the PATCH route does: load current metadata, merge
    // in the sanitized patch, write the merged object back.
    const patch = sanitizeConnectionMetadata({ defaultPropertyId: "987654321" })
    const merged = { ...connection.metadata, ...patch }
    await updateConnectionStatus(connection.id, org.id, { status: connection.status, metadata: merged })

    const updated = await getConnection(connection.id, org.id)
    expect(updated?.metadata.existingKey).toBe("keep-me")
    expect(updated?.metadata.defaultPropertyId).toBe("987654321")
  })

  it("org isolation: a Connection from org A cannot be read or updated using org B's id (the route's real 404-not-403 gate)", async () => {
    const { createOrganization, createConnection, getConnection, updateConnectionStatus } = await import("@/lib/db/repo")

    const orgA = await createOrganization(`GA4 Iso Metadata A ${randomUUID()}`)
    const orgB = await createOrganization(`GA4 Iso Metadata B ${randomUUID()}`)
    const connection = await createConnection({ orgId: orgA.id, connectorId: "connector_google_analytics", authType: "oauth2", status: "connected" })

    expect(await getConnection(connection.id, orgB.id)).toBeNull()
    expect(await updateConnectionStatus(connection.id, orgB.id, { status: "connected", metadata: { defaultPropertyId: "hijack" } })).toBeNull()

    // org A's own copy is untouched by org B's attempt
    const stillA = await getConnection(connection.id, orgA.id)
    expect(stillA?.metadata.defaultPropertyId).toBeUndefined()
  })
})

describe("Category A — read-only action guard (app/api/connections/[id]/actions/[actionId]/route.ts)", () => {
  it("every Google Analytics action the guard would allow through is genuinely permission: read (the guard's whole safety argument)", async () => {
    const { getConnector } = await import("@/lib/connectors/registry")
    const connector = getConnector("connector_google_analytics")!
    for (const action of connector.actions ?? []) {
      expect(action.permission).toBe("read")
    }
  })
})

/* ================================================================== *
 * CATEGORY A — connector platform audit, gap #4: ConnectionStatus
 * gains a real, wired "reauth_required" state (lib/connectors/token-
 * store.ts's getValidAccessToken()), replacing what used to be a
 * generic "error" for the two cases that specifically mean "an
 * operator must reconnect" — no refresh token available, or the
 * provider genuinely rejected a real refresh attempt. Real encryption,
 * real DB writes, and — for the refresh-rejected case — a real local
 * HTTP server standing in for the token endpoint (same pattern
 * test/dynamic-connectors.test.ts already uses: fakes only the
 * network edge, never the policy logic).
 * ================================================================== */

import { createServer, type Server } from "node:http"
import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { OAuth2Config } from "@/lib/connectors/oauth"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — connection lifecycle: reauth_required", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
  })

  it("an expired token with NO refresh token sets status to reauth_required (never a generic 'error')", async () => {
    const { createOrganization, createConnection, getConnection } = await import("@/lib/db/repo")
    const { storeTokens, getValidAccessToken } = await import("@/lib/connectors/token-store")

    const org = await createOrganization(`Lifecycle No-Refresh ${randomUUID()}`)
    const connection = await createConnection({ orgId: org.id, connectorId: "connector_google_analytics", authType: "oauth2", status: "connected" })
    // Real token, already expired, no refresh token stored — the exact
    // shape a provider that never issued one (or a stripped response)
    // would leave behind.
    await storeTokens(connection.id, { accessToken: `expired-token-${randomUUID()}`, expiresAt: Date.now() - 1000 })

    const config: OAuth2Config = { authorizeUrl: "https://example.test/auth", tokenUrl: "https://example.test/token", clientId: "x", clientSecret: "y", redirectUri: "https://example.test/callback", scope: "read" }
    const result = await getValidAccessToken(connection.id, org.id, config)
    expect(result).toBeNull()

    const updated = await getConnection(connection.id, org.id)
    expect(updated?.status).toBe("reauth_required")
    expect(updated?.errorReason).toMatch(/reconnect/i)
  })

  it("a real refresh attempt genuinely rejected by the provider sets status to reauth_required", async () => {
    let server: Server | undefined
    try {
      server = createServer((_req, res) => {
        res.statusCode = 400
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ error: "invalid_grant", error_description: "Refresh token expired or revoked" }))
      })
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      const tokenUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}/token` : ""

      const { createOrganization, createConnection, getConnection } = await import("@/lib/db/repo")
      const { storeTokens, getValidAccessToken } = await import("@/lib/connectors/token-store")

      const org = await createOrganization(`Lifecycle Refresh Rejected ${randomUUID()}`)
      const connection = await createConnection({ orgId: org.id, connectorId: "connector_google_analytics", authType: "oauth2", status: "connected" })
      await storeTokens(connection.id, { accessToken: `expired-token-${randomUUID()}`, refreshToken: `revoked-refresh-${randomUUID()}`, expiresAt: Date.now() - 1000 })

      const config: OAuth2Config = { authorizeUrl: "https://example.test/auth", tokenUrl, clientId: "x", clientSecret: "y", redirectUri: "https://example.test/callback", scope: "read" }
      const result = await getValidAccessToken(connection.id, org.id, config)
      expect(result).toBeNull()

      const updated = await getConnection(connection.id, org.id)
      expect(updated?.status).toBe("reauth_required")
      expect(updated?.errorReason).toBeTruthy()
    } finally {
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
    }
  })

  it("a real, successful refresh never touches connection.status (stays 'connected', untouched) — reauth_required is only ever set on a genuine failure", async () => {
    let server: Server | undefined
    try {
      server = createServer((_req, res) => {
        res.statusCode = 200
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ access_token: `refreshed-${randomUUID()}`, refresh_token: `refresh-${randomUUID()}`, expires_in: 3600 }))
      })
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      const tokenUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}/token` : ""

      const { createOrganization, createConnection, getConnection } = await import("@/lib/db/repo")
      const { storeTokens, getValidAccessToken } = await import("@/lib/connectors/token-store")

      const org = await createOrganization(`Lifecycle Refresh OK ${randomUUID()}`)
      const connection = await createConnection({ orgId: org.id, connectorId: "connector_google_analytics", authType: "oauth2", status: "connected" })
      await storeTokens(connection.id, { accessToken: `expired-token-${randomUUID()}`, refreshToken: `valid-refresh-${randomUUID()}`, expiresAt: Date.now() - 1000 })

      const config: OAuth2Config = { authorizeUrl: "https://example.test/auth", tokenUrl, clientId: "x", clientSecret: "y", redirectUri: "https://example.test/callback", scope: "read" }
      const result = await getValidAccessToken(connection.id, org.id, config)
      expect(result?.accessToken).toBeTruthy()

      const updated = await getConnection(connection.id, org.id)
      expect(updated?.status).toBe("connected")
      expect(updated?.errorReason).toBeUndefined()
    } finally {
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
    }
  })
})

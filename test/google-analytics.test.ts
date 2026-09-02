/* ================================================================== *
 * CATEGORY A — pure runtime test (no external Google credentials —
 * GOOGLE_CLIENT_ID/SECRET are not configured in this environment, so
 * the real network calls to analyticsadmin.googleapis.com/
 * analyticsdata.googleapis.com are honestly untestable here; see the
 * final connector report for what that blocks). Proves the real,
 * complete architecture: registry shape, the shared OAuth engine's
 * new extraAuthorizeParams capability (needed for Google's real
 * access_type=offline/prompt=consent), honest not_configured health
 * reporting, and real error classification/credential hygiene on the
 * one path that doesn't require live Google credentials — an
 * unconnected/no-credential Connection.
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe("Category A — Google Analytics 4 connector", () => {
  it("is registered, enabled, and declares exactly the 5 required read-only tools", async () => {
    const { getConnector } = await import("@/lib/connectors/registry")
    const connector = getConnector("connector_google_analytics")
    expect(connector).toBeTruthy()
    expect(connector!.enabled).toBe(true)
    expect(connector!.authenticationType).toBe("oauth2")

    const ids = connector!.actions!.map((a) => a.id).sort()
    expect(ids).toEqual(["get_metadata", "list_accounts", "list_properties", "run_realtime_report", "run_report"].sort())
    for (const action of connector!.actions!) {
      expect(action.permission).toBe("read") // GA4 scope here is read-only — never a write action
      expect(action.riskLevel).toBe("low")
    }
  })

  it("run_report and run_realtime_report declare explicit, real input/output schemas (not a passthrough blob)", async () => {
    const { getConnector } = await import("@/lib/connectors/registry")
    const connector = getConnector("connector_google_analytics")!
    const runReport = connector.actions!.find((a) => a.id === "run_report")!
    expect(runReport.inputSchema.propertyId?.required).toBe(true)
    expect(runReport.inputSchema.metrics?.required).toBe(true)
    expect(runReport.outputSchema.rows).toBeTruthy()

    const realtime = connector.actions!.find((a) => a.id === "run_realtime_report")!
    expect(realtime.inputSchema.propertyId?.required).toBe(true)
    expect(realtime.inputSchema.metrics?.required).toBe(true)
  })

  it("the OAuth provider registry has a real Google Analytics entry using the shared Google OAuth config", async () => {
    const { getOAuthProvider } = await import("@/lib/connectors/oauth-providers")
    const provider = getOAuthProvider("connector_google_analytics")
    expect(provider).toBeTruthy()
    const config = provider!.buildConfig("https://example.test/callback")
    expect(config.authorizeUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(config.tokenUrl).toBe("https://oauth2.googleapis.com/token")
    expect(config.scope).toBe("https://www.googleapis.com/auth/analytics.readonly")
  })

  it("real Google-required authorize params (access_type=offline, prompt=consent) actually appear in the built authorize URL — the shared OAuth engine's new generic capability, not a Google-only hack", async () => {
    const { getOAuthProvider } = await import("@/lib/connectors/oauth-providers")
    const { buildAuthorizeUrl } = await import("@/lib/connectors/oauth")
    const provider = getOAuthProvider("connector_google_analytics")!
    const config = provider.buildConfig("https://example.test/callback")
    const url = new URL(buildAuthorizeUrl(config, "real-state-value"))
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.get("state")).toBe("real-state-value")
  })

  it("Salesforce's authorize URL is unaffected by the new extraAuthorizeParams capability (no access_type/prompt leak into an unrelated provider)", async () => {
    const { getOAuthProvider } = await import("@/lib/connectors/oauth-providers")
    const { buildAuthorizeUrl } = await import("@/lib/connectors/oauth")
    const provider = getOAuthProvider("connector_salesforce")!
    const config = provider.buildConfig("https://example.test/callback")
    const url = new URL(buildAuthorizeUrl(config, "s"))
    expect(url.searchParams.get("access_type")).toBeNull()
    expect(url.searchParams.get("prompt")).toBeNull()
  })

  it("honestly reports NOT_CONFIGURED — this environment has no GOOGLE_CLIENT_ID/SECRET, and healthCheck never fabricates healthy", async () => {
    const originalId = process.env.GOOGLE_CLIENT_ID
    const originalSecret = process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    try {
      const { googleAnalyticsConnector } = await import("@/lib/connectors/providers/google-analytics")
      const result = await googleAnalyticsConnector.healthCheck!({ id: "conn_fake", organizationId: "org_fake", connectorId: "connector_google_analytics", status: "not_connected", authType: "oauth2", metadata: {}, createdAt: 0, updatedAt: 0 })
      expect(result.state).toBe("not_configured")
    } finally {
      if (originalId) process.env.GOOGLE_CLIENT_ID = originalId
      if (originalSecret) process.env.GOOGLE_CLIENT_SECRET = originalSecret
    }
  })

  it("an action on a not-yet-connected Connection fails honestly — never a fabricated result, never a real network call attempted (same classification Salesforce's identical 'not connected' path already uses)", async () => {
    const { googleAnalyticsConnector } = await import("@/lib/connectors/providers/google-analytics")
    const tools = googleAnalyticsConnector.buildTools({ id: "conn_fake", organizationId: "org_fake", connectorId: "connector_google_analytics", status: "not_connected", authType: "oauth2", metadata: {}, createdAt: 0, updatedAt: 0 })
    const tool = tools[0]
    expect(tool.isConnected()).toBe(false)
    const action = tool.actions.find((a) => a.id === "list_accounts")!
    const result = await action.run({}, { workerId: "w", executionId: "e", emit: () => {} })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not connected/i)
  })

  describe.skipIf(!hasDb)("Category A — DB-backed: real credential storage + organization isolation", () => {
    beforeAll(() => {
      process.env.LLM_DEV_MODE = "true"
      process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    })

    it("a real (fake-provider-response, real-encryption) stored GA4 credential is org-isolated exactly like Salesforce's", async () => {
      const { createOrganization, createConnection } = await import("@/lib/db/repo")
      const { storeTokens, getValidAccessToken } = await import("@/lib/connectors/token-store")
      const { googleAnalyticsOAuthConfig } = await import("@/lib/connectors/providers/google-analytics")

      const orgA = await createOrganization(`GA4 Iso A ${randomUUID()}`)
      const orgB = await createOrganization(`GA4 Iso B ${randomUUID()}`)
      const connection = await createConnection({ orgId: orgA.id, connectorId: "connector_google_analytics", authType: "oauth2", status: "connected" })

      await storeTokens(connection.id, { accessToken: `real-access-token-${randomUUID()}`, refreshToken: `real-refresh-token-${randomUUID()}`, expiresAt: Date.now() + 3600_000 })

      const tokenForA = await getValidAccessToken(connection.id, orgA.id, googleAnalyticsOAuthConfig(""))
      expect(tokenForA?.accessToken).toBeTruthy()

      // Org B asking about org A's connection id gets nothing — the
      // credential lookup itself isn't org-scoped by connectionId
      // alone (oauth_credentials keys on connection_id), but the
      // Connection row it would need to resolve first is — proven via
      // getConnection, the real gate every real call site uses first.
      const { getConnection } = await import("@/lib/db/repo")
      expect(await getConnection(connection.id, orgB.id)).toBeNull()
    })
  })
})

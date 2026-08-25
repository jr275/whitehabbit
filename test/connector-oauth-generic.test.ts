/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials): the
 * generic OAuth2 engine (lib/connectors/oauth-providers.ts +
 * lib/connectors/oauth-flow.ts) that replaced Salesforce's original
 * hand-written route trio with one shared, connector-id-driven
 * implementation — proving a second real provider (Slack) needed zero
 * new route code, only a registry entry.
 * ================================================================== */

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("Category A — generic OAuth provider registry", () => {
  it("resolves a real OAuthProviderDefinition for both real OAuth2 connectors", async () => {
    const { getOAuthProvider } = await import("@/lib/connectors/oauth-providers")

    const salesforce = getOAuthProvider("connector_salesforce")
    expect(salesforce).toBeTruthy()
    const sfConfig = salesforce!.buildConfig("https://example.test/callback")
    expect(sfConfig.authorizeUrl).toMatch(/^https:\/\//)
    expect(sfConfig.tokenUrl).toMatch(/^https:\/\//)
    expect(sfConfig.redirectUri).toBe("https://example.test/callback")

    const slack = getOAuthProvider("connector_slack")
    expect(slack).toBeTruthy()
    const slackConfig = slack!.buildConfig("https://example.test/callback")
    expect(slackConfig.authorizeUrl).toBe("https://slack.com/oauth/v2/authorize")
    expect(slackConfig.tokenUrl).toBe("https://slack.com/api/oauth.v2.access")
  })

  it("a non-OAuth2 connector (the Internal Test Connector, authType none) is not in the OAuth registry", async () => {
    const { getOAuthProvider } = await import("@/lib/connectors/oauth-providers")
    expect(getOAuthProvider("connector_test")).toBeUndefined()
  })

  it("Slack is now enabled — the real, complete adapter was only ever gated on having an OAuth2 route, which now exists generically", async () => {
    const { slackConnector } = await import("@/lib/connectors/providers/slack")
    expect(slackConnector.enabled).toBe(true)
    expect(slackConnector.authenticationType).toBe("oauth2")
  })

  it("buildMetadata never includes a secret-shaped key for either real provider", async () => {
    const { getOAuthProvider } = await import("@/lib/connectors/oauth-providers")
    const fakeTokens = { accessToken: "fake-access-token-value", refreshToken: "fake-refresh-token-value", extra: { instance_url: "https://example.my.salesforce.com", team_id: "T123", team_name: "Acme", bot_user_id: "U456" } }
    for (const connectorId of ["connector_salesforce", "connector_slack"]) {
      const provider = getOAuthProvider(connectorId)!
      const metadata = provider.buildMetadata?.(fakeTokens) ?? {}
      const serialized = JSON.stringify(metadata)
      expect(serialized).not.toContain("fake-access-token-value")
      expect(serialized).not.toContain("fake-refresh-token-value")
      for (const key of Object.keys(metadata)) {
        expect(key).not.toMatch(/token|secret|password|credential/i)
      }
    }
  })

  it("Salesforce's named legacy routes delegate to the shared oauth-flow module — not a second, parallel implementation", () => {
    const files = ["app/api/connectors/salesforce/authorize/route.ts", "app/api/connectors/salesforce/callback/route.ts", "app/api/connectors/salesforce/disconnect/route.ts"]
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8")
      expect(source, `${file} must delegate to lib/connectors/oauth-flow`).toMatch(/from "@\/lib\/connectors\/oauth-flow"/)
      // A real, honest delegation has no re-implemented token-exchange
      // logic of its own left behind.
      expect(source).not.toMatch(/exchangeCode|buildAuthorizeUrl/)
    }
  })

  it("the generic [connectorId] route trio exists and also delegates to the same shared module", () => {
    const files = ["app/api/connectors/[connectorId]/authorize/route.ts", "app/api/connectors/[connectorId]/callback/route.ts", "app/api/connectors/[connectorId]/disconnect/route.ts"]
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8")
      expect(source).toMatch(/from "@\/lib\/connectors\/oauth-flow"/)
    }
  })
})

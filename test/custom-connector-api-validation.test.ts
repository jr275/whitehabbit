/* ================================================================== *
 * CATEGORY A — pure runtime test, no DB, no external network (the one
 * async check here, assertSafeBaseUrl, is the same real DNS-resolving
 * SSRF guard test/ssrf-guard.test.ts already exercises directly).
 * Connector platform audit, Fase D6: proves the shared validation
 * module every /api/custom-connectors* route calls through actually
 * enforces what those routes' own doc comments claim — most
 * importantly, that a private/internal baseUrl is rejected HERE,
 * before any route would ever persist it, not merely at call time.
 * ================================================================== */

import { describe, expect, it } from "vitest"

describe("Category A — custom connector input validation (Fase D6)", () => {
  it("name/description/category/icon: required-ness and length limits are real", async () => {
    const { assertValidName, assertValidDescription, assertValidCategory, assertValidIcon, CustomConnectorValidationError } = await import("@/lib/connectors/validate-custom-connector")

    expect(assertValidName("Acme CRM")).toBe("Acme CRM")
    expect(() => assertValidName("")).toThrow(CustomConnectorValidationError)
    expect(() => assertValidName(undefined)).toThrow(CustomConnectorValidationError)
    expect(() => assertValidName("x".repeat(121))).toThrow(CustomConnectorValidationError)

    expect(assertValidDescription(undefined)).toBeUndefined()
    expect(assertValidDescription("A real description.")).toBe("A real description.")
    expect(() => assertValidDescription("x".repeat(2001))).toThrow(CustomConnectorValidationError)
    expect(() => assertValidDescription(42)).toThrow(CustomConnectorValidationError)

    expect(assertValidCategory(undefined)).toBeUndefined()
    expect(assertValidCategory("CRM")).toBe("CRM")
    expect(() => assertValidCategory("x".repeat(65))).toThrow(CustomConnectorValidationError)

    expect(assertValidIcon(undefined)).toBeUndefined()
    expect(assertValidIcon("🧩")).toBe("🧩")
    expect(() => assertValidIcon("x".repeat(17))).toThrow(CustomConnectorValidationError)
  })

  it("assertValidRestConfig accepts a real, safe baseUrl (a literal IP, no DNS lookup needed — this sandbox has no outbound DNS) and a valid authType", async () => {
    const { assertValidRestConfig } = await import("@/lib/connectors/validate-custom-connector")
    const config = await assertValidRestConfig({ baseUrl: "http://127.0.0.1:1", authType: "bearer_token" })
    expect(config).toEqual({ baseUrl: "http://127.0.0.1:1", authType: "bearer_token", apiKeyHeader: undefined })
  })

  it("assertValidRestConfig rejects a private/internal baseUrl BEFORE anything would be persisted — the real SSRF guard, not a lookalike", async () => {
    const { assertValidRestConfig, CustomConnectorValidationError } = await import("@/lib/connectors/validate-custom-connector")
    await expect(assertValidRestConfig({ baseUrl: "http://169.254.169.254/latest/meta-data/", authType: "none" })).rejects.toBeInstanceOf(CustomConnectorValidationError)
    await expect(assertValidRestConfig({ baseUrl: "http://10.0.0.5/", authType: "none" })).rejects.toBeInstanceOf(CustomConnectorValidationError)
  })

  it("assertValidRestConfig rejects an invalid authType and a malformed apiKeyHeader", async () => {
    const { assertValidRestConfig, CustomConnectorValidationError } = await import("@/lib/connectors/validate-custom-connector")
    await expect(assertValidRestConfig({ baseUrl: "https://api.example.com", authType: "hmac" })).rejects.toBeInstanceOf(CustomConnectorValidationError)
    await expect(assertValidRestConfig({ baseUrl: "https://api.example.com", authType: "api_key", apiKeyHeader: "" })).rejects.toBeInstanceOf(CustomConnectorValidationError)
  })

  it("assertValidMcpConfig accepts a real, safe endpointUrl (a literal IP — this sandbox has no outbound DNS) and rejects a private one", async () => {
    const { assertValidMcpConfig, CustomConnectorValidationError } = await import("@/lib/connectors/validate-custom-connector")
    expect(await assertValidMcpConfig({ endpointUrl: "http://127.0.0.1:1/rpc" })).toEqual({ endpointUrl: "http://127.0.0.1:1/rpc" })
    await expect(assertValidMcpConfig({ endpointUrl: "http://192.168.1.1/rpc" })).rejects.toBeInstanceOf(CustomConnectorValidationError)
  })

  it("assertValidCredentialForConnector matches the credential shape to the connector's own kind/authType — never a looser check", async () => {
    const { assertValidCredentialForConnector, CustomConnectorValidationError } = await import("@/lib/connectors/validate-custom-connector")
    const restApiKey = { id: "c1", organizationId: "org1", slug: "s", kind: "rest" as const, name: "N", config: { baseUrl: "https://x.test", authType: "api_key" as const }, discoveredTools: [], status: "not_connected" as const, createdAt: 0, updatedAt: 0 }

    expect(assertValidCredentialForConnector(restApiKey, { type: "api_key", value: "secret" })).toEqual({ type: "api_key", value: "secret" })
    expect(() => assertValidCredentialForConnector(restApiKey, { type: "bearer_token", token: "wrong-type" })).toThrow(CustomConnectorValidationError)
    expect(() => assertValidCredentialForConnector(restApiKey, { type: "api_key" })).toThrow(CustomConnectorValidationError) // missing value

    const restNone = { ...restApiKey, config: { baseUrl: "https://x.test", authType: "none" as const } }
    expect(() => assertValidCredentialForConnector(restNone, { type: "api_key", value: "x" })).toThrow(CustomConnectorValidationError)

    const mcp = { ...restApiKey, kind: "mcp" as const, config: { endpointUrl: "https://mcp.test/rpc" } }
    expect(assertValidCredentialForConnector(mcp, { type: "mcp_bearer", token: "t" })).toEqual({ type: "mcp_bearer", token: "t" })
    expect(() => assertValidCredentialForConnector(mcp, { type: "api_key", value: "x" })).toThrow(CustomConnectorValidationError)
  })
})

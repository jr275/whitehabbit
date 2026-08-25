import "server-only"

/* ================================================================== *
 * CUSTOM CONNECTOR INPUT VALIDATION — connector platform audit, Fase
 * D6. Every field a self-service POST/PATCH could ever accept is
 * validated here, in one place, so app/api/custom-connectors' routes
 * stay thin and none of them can drift into checking a field
 * differently than another. Deliberately dependency-free (same
 * convention as lib/connectors/sanitize-metadata.ts) — plain thrown
 * Errors, which every route re-raises as api-error.ts's real
 * ValidationError.
 *
 * The one check that matters most: assertSafeBaseUrl calls the real
 * SSRF guard (lib/security/ssrf-guard.ts) BEFORE a baseUrl/endpointUrl
 * is ever persisted — "create com baseUrl privado (rejeitado antes de
 * gravar)", not merely rejected at call time. This is what makes it
 * safe to expose POST /api/custom-connectors as self-service at all.
 * ================================================================== */

import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"
import type { CustomConnector, CustomConnectorCredential, CustomConnectorMcpConfig, CustomConnectorRestConfig } from "./types"

export class CustomConnectorValidationError extends Error {}

const REST_AUTH_TYPES = new Set(["none", "api_key", "bearer_token", "basic_auth"])
const MAX_NAME = 120
const MAX_DESCRIPTION = 2000
const MAX_URL = 2048
const MAX_HEADER_NAME = 128

export function assertValidName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new CustomConnectorValidationError("name is required.")
  if (name.length > MAX_NAME) throw new CustomConnectorValidationError(`name must be ${MAX_NAME} characters or fewer.`)
  return name.trim()
}

export function assertValidDescription(description: unknown): string | undefined {
  if (description === undefined || description === null) return undefined
  if (typeof description !== "string") throw new CustomConnectorValidationError("description must be a string.")
  if (description.length > MAX_DESCRIPTION) throw new CustomConnectorValidationError(`description must be ${MAX_DESCRIPTION} characters or fewer.`)
  return description
}

export function assertValidCategory(category: unknown): string | undefined {
  if (category === undefined || category === null) return undefined
  if (typeof category !== "string" || category.length > 64) throw new CustomConnectorValidationError("category must be a string of 64 characters or fewer.")
  return category
}

export function assertValidIcon(icon: unknown): string | undefined {
  if (icon === undefined || icon === null) return undefined
  if (typeof icon !== "string" || icon.length > 16) throw new CustomConnectorValidationError("icon must be a short string (16 characters or fewer).")
  return icon
}

/** Real, live safety check — resolves DNS and rejects a private/
 * internal/metadata target exactly like every actual call would (same
 * guard, not a lookalike). Never persisted if this throws. */
export async function assertSafeBaseUrl(url: unknown, field: string): Promise<string> {
  if (typeof url !== "string" || !url.trim()) throw new CustomConnectorValidationError(`${field} is required.`)
  if (url.length > MAX_URL) throw new CustomConnectorValidationError(`${field} must be ${MAX_URL} characters or fewer.`)
  try {
    await assertSafeUrl(url)
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new CustomConnectorValidationError(`${field}: ${err.message}`)
    throw err
  }
  return url
}

export async function assertValidRestConfig(config: unknown): Promise<CustomConnectorRestConfig> {
  if (typeof config !== "object" || config === null) throw new CustomConnectorValidationError("config is required for a REST connector.")
  const c = config as Record<string, unknown>
  const baseUrl = await assertSafeBaseUrl(c.baseUrl, "config.baseUrl")
  const authType = c.authType
  if (typeof authType !== "string" || !REST_AUTH_TYPES.has(authType)) {
    throw new CustomConnectorValidationError(`config.authType must be one of: ${[...REST_AUTH_TYPES].join(", ")}.`)
  }
  let apiKeyHeader: string | undefined
  if (c.apiKeyHeader !== undefined) {
    if (typeof c.apiKeyHeader !== "string" || !c.apiKeyHeader.trim() || c.apiKeyHeader.length > MAX_HEADER_NAME) {
      throw new CustomConnectorValidationError("config.apiKeyHeader must be a non-empty header name.")
    }
    apiKeyHeader = c.apiKeyHeader.trim()
  }
  return { baseUrl, authType: authType as CustomConnectorRestConfig["authType"], apiKeyHeader }
}

export async function assertValidMcpConfig(config: unknown): Promise<CustomConnectorMcpConfig> {
  if (typeof config !== "object" || config === null) throw new CustomConnectorValidationError("config is required for an MCP connector.")
  const c = config as Record<string, unknown>
  const endpointUrl = await assertSafeBaseUrl(c.endpointUrl, "config.endpointUrl")
  return { endpointUrl }
}

export async function assertValidConfig(kind: CustomConnector["kind"], config: unknown): Promise<CustomConnector["config"]> {
  if (kind === "rest") return assertValidRestConfig(config)
  if (kind === "mcp") return assertValidMcpConfig(config)
  throw new CustomConnectorValidationError('kind must be "rest" or "mcp".')
}

export function assertValidKind(kind: unknown): CustomConnector["kind"] {
  if (kind !== "rest" && kind !== "mcp") throw new CustomConnectorValidationError('kind must be "rest" or "mcp".')
  return kind
}

/** Validates a submitted credential's SHAPE matches what this
 * connector's own configuration actually needs — never a looser
 * "any object with a string field" check. An MCP connector only ever
 * accepts mcp_bearer (lib/connectors/dynamic.ts's resolveMcpHeaders);
 * a REST connector's expected credential type is dictated by its own
 * config.authType, and "none" never accepts a credential at all —
 * there is nothing to store. */
export function assertValidCredentialForConnector(row: CustomConnector, credential: unknown): CustomConnectorCredential {
  if (typeof credential !== "object" || credential === null || typeof (credential as Record<string, unknown>).type !== "string") {
    throw new CustomConnectorValidationError("credential is required and must include a type.")
  }
  const c = credential as Record<string, unknown>

  if (row.kind === "mcp") {
    if (c.type !== "mcp_bearer" || typeof c.token !== "string" || !c.token) {
      throw new CustomConnectorValidationError('An MCP connector credential must be {"type":"mcp_bearer","token":"..."}.')
    }
    return { type: "mcp_bearer", token: c.token }
  }

  const config = row.config as CustomConnectorRestConfig
  if (config.authType === "none") {
    throw new CustomConnectorValidationError(`This connector's authType is "none" — it does not accept a credential.`)
  }
  if (c.type !== config.authType) {
    throw new CustomConnectorValidationError(`This connector's authType is "${config.authType}" — credential.type must match.`)
  }
  if (c.type === "api_key") {
    if (typeof c.value !== "string" || !c.value) throw new CustomConnectorValidationError('An api_key credential must be {"type":"api_key","value":"..."}.')
    return { type: "api_key", value: c.value }
  }
  if (c.type === "bearer_token") {
    if (typeof c.token !== "string" || !c.token) throw new CustomConnectorValidationError('A bearer_token credential must be {"type":"bearer_token","token":"..."}.')
    return { type: "bearer_token", token: c.token }
  }
  if (c.type === "basic_auth") {
    if (typeof c.username !== "string" || !c.username || typeof c.password !== "string" || !c.password) {
      throw new CustomConnectorValidationError('A basic_auth credential must be {"type":"basic_auth","username":"...","password":"..."}.')
    }
    return { type: "basic_auth", username: c.username, password: c.password }
  }
  throw new CustomConnectorValidationError(`Unrecognized credential type "${String(c.type)}".`)
}

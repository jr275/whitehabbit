/* ================================================================== *
 * OPENAPI IMPORT (MVP) — section 15 of the connectivity platform
 * brief. Parses a real OpenAPI 3.x document (JSON only — no
 * `swagger`/`openapi` package exists in this repo and none is added
 * for this; a YAML spec is reported as unsupported, never silently
 * mishandled) and generates one real ConnectorAction per operation —
 * never executes anything from the spec itself. The generated actions
 * are only ever REGISTERED on a Custom REST Connector row
 * (lib/connectors/custom-rest.ts), which is what actually calls out,
 * through the controlled connector runtime — the same tool-runner/
 * approval/retry path every other connector action goes through.
 *
 * Deliberately NOT a client-safe module ("server-only" isn't needed
 * here — this is pure parsing, no I/O — but it's only ever called
 * from a server route).
 * ================================================================== */

import { deriveHttpRisk } from "./http-risk"
import type { ConnectorAction, ConnectorSchema, ConnectorSchemaField } from "./types"

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

export interface OpenApiImportResult {
  actions: ConnectorAction[]
  warnings: string[]
}

export class OpenApiImportError extends Error {}

interface JsonSchemaLike {
  type?: string
  description?: string
  properties?: Record<string, JsonSchemaLike>
  required?: string[]
  items?: JsonSchemaLike
}

function mapSchemaType(t: string | undefined): ConnectorSchemaField["type"] {
  if (t === "integer" || t === "number") return "number"
  if (t === "boolean") return "boolean"
  if (t === "array") return "array"
  if (t === "object") return "object"
  return "string"
}

function schemaToFields(schema: JsonSchemaLike | undefined): ConnectorSchema {
  if (!schema?.properties) return {}
  const required = new Set(schema.required ?? [])
  const fields: ConnectorSchema = {}
  for (const [key, propRaw] of Object.entries(schema.properties)) {
    const field: ConnectorSchemaField = { type: mapSchemaType(propRaw.type), description: propRaw.description ?? "", required: required.has(key) || undefined }
    if ((field.type === "object" || field.type === "array") && propRaw.properties) field.properties = schemaToFields(propRaw)
    fields[key] = field
  }
  return fields
}

function operationToAction(path: string, method: HttpMethod, op: Record<string, unknown>, warnings: string[]): ConnectorAction {
  const operationId = typeof op.operationId === "string" ? op.operationId : undefined
  const sanitizedPath = path.replace(/[{}]/g, "").replace(/\//g, "_").replace(/^_+|_+$/g, "")
  const id = operationId || `${method}_${sanitizedPath || "root"}`
  const summary = typeof op.summary === "string" ? op.summary : undefined
  const description = typeof op.description === "string" ? op.description : (summary ?? "")

  const inputSchema: ConnectorSchema = {}
  const parameters = Array.isArray(op.parameters) ? (op.parameters as Record<string, unknown>[]) : []
  for (const param of parameters) {
    const name = typeof param.name === "string" ? param.name : undefined
    if (!name) continue
    const schema = (param.schema as JsonSchemaLike | undefined) ?? {}
    inputSchema[name] = { type: mapSchemaType(schema.type), description: typeof param.description === "string" ? param.description : "", required: param.required === true || undefined }
  }

  const requestBody = op.requestBody as { content?: Record<string, { schema?: JsonSchemaLike }> } | undefined
  const bodySchema = requestBody?.content?.["application/json"]?.schema
  if (bodySchema) Object.assign(inputSchema, schemaToFields(bodySchema))

  const responses = op.responses as Record<string, { content?: Record<string, { schema?: JsonSchemaLike }> }> | undefined
  const successResponse = responses?.["200"] ?? responses?.["201"]
  const outputSchema = schemaToFields(successResponse?.content?.["application/json"]?.schema)

  if (!description) warnings.push(`${method.toUpperCase()} ${path}: no description in the spec — the generated action's description is empty.`)

  const { permission, riskLevel } = deriveHttpRisk(method)

  return {
    id,
    label: summary || id,
    description,
    inputSchema,
    outputSchema,
    permission,
    riskLevel,
    httpMethod: method.toUpperCase() as ConnectorAction["httpMethod"],
    httpPath: path,
  }
}

/** Parses a real OpenAPI 3.x JSON document into real ConnectorAction
 * entries — one per operation, with a real input/output schema
 * derived from that operation's own declared parameters/requestBody/
 * response, never a fabricated shape. Never executes anything from
 * the document; this function only ever produces data. */
export function parseOpenApiSpec(specText: string): OpenApiImportResult {
  let spec: Record<string, unknown>
  try {
    spec = JSON.parse(specText)
  } catch {
    throw new OpenApiImportError("Could not parse this as JSON. Only OpenAPI 3.x JSON documents are supported in this version — YAML specs are not yet supported.")
  }

  const version = typeof spec.openapi === "string" ? spec.openapi : undefined
  if (!version || !version.startsWith("3.")) {
    throw new OpenApiImportError(`Unsupported or missing "openapi" version (found: ${version ?? "none"}) — only OpenAPI 3.x is supported.`)
  }

  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined
  if (!paths || typeof paths !== "object") throw new OpenApiImportError('This document has no "paths" — nothing to import.')

  const actions: ConnectorAction[] = []
  const warnings: string[] = []
  const seenIds = new Set<string>()

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as Record<string, unknown> | undefined
      if (!op) continue
      const action = operationToAction(path, method, op, warnings)
      if (seenIds.has(action.id)) {
        warnings.push(`Duplicate operationId/generated id "${action.id}" — only the first occurrence was imported.`)
        continue
      }
      seenIds.add(action.id)
      actions.push(action)
    }
  }

  if (actions.length === 0) throw new OpenApiImportError("No GET/POST/PUT/PATCH/DELETE operations found in this document.")
  return { actions, warnings }
}

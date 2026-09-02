/* ================================================================== *
 * HTTP METHOD -> PERMISSION/RISK — the one real derivation rule,
 * extracted from lib/connectors/openapi-import.ts (which already had
 * this exactly right) so lib/connectors/custom-rest.ts's generic
 * "call" action can use the identical rule instead of a hardcoded,
 * always-wrong-for-some-methods permission/riskLevel (connector
 * platform audit, gap #14 — the BLOCKER: a Custom REST Connector's
 * generic action must never let the approval gate see a fixed
 * classification that doesn't reflect the real HTTP method a given
 * call actually used).
 *
 * GET -> read/low. POST/PUT/PATCH -> write/medium. DELETE -> delete/
 * high. No dependency-free-JSON-Schema module, no I/O — pure data.
 * ================================================================== */

import type { ToolPermission, RiskLevel } from "@/lib/agent/types"

export function deriveHttpPermission(method: string): ToolPermission {
  const m = method.toUpperCase()
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "read"
  if (m === "DELETE") return "delete"
  return "write" // POST, PUT, PATCH, and anything else this system doesn't specifically recognize
}

export function deriveHttpRiskLevel(permission: ToolPermission): RiskLevel {
  if (permission === "read") return "low"
  if (permission === "delete") return "high"
  return "medium"
}

/** The one call most sites actually want — method in, {permission,
 * riskLevel} out. */
export function deriveHttpRisk(method: string): { permission: ToolPermission; riskLevel: RiskLevel } {
  const permission = deriveHttpPermission(method)
  return { permission, riskLevel: deriveHttpRiskLevel(permission) }
}

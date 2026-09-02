import "server-only"

/* ================================================================== *
 * CONNECTOR OBSERVABILITY — connector platform audit, Fase D9. Real,
 * structured connector_execution_started/completed/failed events for
 * EVERY connector action call, built-in and custom alike, wired at
 * exactly two chokepoints (lib/connectors/registry.ts's
 * getConnectorTools() for built-in, lib/connectors/dynamic.ts's
 * buildDynamicConnectorTools() for custom) — never scattered per
 * provider, never left to each skill to remember.
 *
 * The redaction guarantee is structural, not a scrub pass: every
 * emitter function below only ever ACCEPTS the named fields in
 * ConnectorExecutionFields/ConnectorExecutionOutcome — there is no
 * parameter shape here a caller could use to pass a raw headers
 * object, an Authorization value, or a decrypted credential through
 * to an event payload, because the TypeScript signatures never admit
 * one. This is what "never API key/Bearer token/OAuth token/Cookie/
 * Authorization header/sensitive request body" actually means in
 * code, not a comment asking every future call site to remember it.
 * ================================================================== */

import type { RuntimeEventType, ToolContext } from "@/lib/agent/types"

/** Identifies WHICH connector/connection/tool/action this execution
 * event is about — never anything about HOW the call authenticated.
 * organizationId/workerId/executionId are already real, first-class
 * columns on every persisted WorkerEvent (see lib/db/repo.ts's
 * insertExecutionEvent) — deliberately not duplicated into payload
 * here. */
export interface ConnectorExecutionFields {
  connectorId: string
  /** The real Connection row id this execution used, when one exists.
   * Absent for a custom/dynamic connector in this phase — its default
   * credential path (lib/db/repo.ts's getCustomConnectorCredential)
   * has no live Connection identity driving execution yet (Fase D2 is
   * additive schema only; see that migration's own header comment) —
   * omitting it here is honest, not a gap papered over with a
   * fabricated id nothing actually resolved through. */
  connectionId?: string
  toolId: string
  actionId: string
}

export interface ConnectorExecutionOutcome {
  durationMs: number
  /** The real HTTP status code, when this call was HTTP-shaped and
   * got a response at all (ToolActionResult.httpStatus). */
  httpStatus?: number
  /** The structured failure classification already computed for the
   * real ToolActionResult (lib/agent/types.ts's ExecutionReasonCode) —
   * never a raw provider error body. */
  errorCode?: string
}

function emit(ctx: ToolContext, type: RuntimeEventType, fields: ConnectorExecutionFields, extra: Record<string, unknown>): void {
  ctx.emit(type, { connectorId: fields.connectorId, connectionId: fields.connectionId, toolId: fields.toolId, actionId: fields.actionId, ...extra })
}

export function emitConnectorExecutionStarted(ctx: ToolContext, fields: ConnectorExecutionFields): void {
  emit(ctx, "connector_execution_started", fields, {})
}

export function emitConnectorExecutionCompleted(ctx: ToolContext, fields: ConnectorExecutionFields, outcome: ConnectorExecutionOutcome): void {
  emit(ctx, "connector_execution_completed", fields, { status: "ok", durationMs: outcome.durationMs, httpStatus: outcome.httpStatus })
}

export function emitConnectorExecutionFailed(ctx: ToolContext, fields: ConnectorExecutionFields, outcome: ConnectorExecutionOutcome): void {
  emit(ctx, "connector_execution_failed", fields, { status: "failed", durationMs: outcome.durationMs, httpStatus: outcome.httpStatus, errorCode: outcome.errorCode })
}

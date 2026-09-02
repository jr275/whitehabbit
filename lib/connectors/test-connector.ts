import "server-only"

/* ================================================================== *
 * INTERNAL TEST CONNECTOR — proves the Connector Foundation end to
 * end without any real third-party account.
 *
 * Two real tools:
 *   - `connector_test.echo`  — read-only, no side effect.
 *   - `connector_test.actions` (action: "record") — a real, WRITE,
 *     medium-risk action that performs one real internal side effect
 *     (a row in test_connector_records — see migrations/0007). This
 *     is what lets the runtime-hardening test suite and a live
 *     Playwright pass genuinely exercise the real permission gate,
 *     the real WAITING_FOR_APPROVAL state, the real Approve-resumes-
 *     the-same-execution mechanism, and the real idempotency ledger
 *     end to end — without a real Salesforce/Slack account. Its
 *     records are never presented as a real business result anywhere
 *     in the product; this connector never appears as a real
 *     integration to end users outside this validation.
 * ================================================================== */

import { insertTestConnectorRecord } from "@/lib/db/repo"
import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import type { Connection, ConnectorDefinition } from "./types"

interface EchoInput {
  message: string
}

async function echoRun(input: EchoInput, _ctx: ToolContext): Promise<ToolActionResult<{ echoed: string }>> {
  const started = Date.now()
  return { ok: true, data: { echoed: input.message }, durationMs: Date.now() - started }
}

interface RecordInput {
  note: string
}

/** The connector's one real write — a genuine Postgres row, scoped to
 * the calling org, optionally tied to the real execution that
 * produced it. Real, durable, org-isolated; never fabricated. */
async function recordRun(connection: Connection, input: RecordInput, ctx: ToolContext): Promise<ToolActionResult<{ id: string }>> {
  const started = Date.now()
  const row = await insertTestConnectorRecord({ orgId: connection.organizationId, executionId: ctx.executionId, note: input.note })
  return { ok: true, data: { id: row.id }, durationMs: Date.now() - started }
}

function buildTestConnectorTools(connection: Connection): ToolDefinition[] {
  return [
    {
      id: "connector_test.echo",
      name: "Test Connector — Echo",
      provider: "internal-test",
      description: "Internal, non-external test tool used only to validate the Connector Foundation's wiring into the real Tool Registry.",
      // Real, live status: this tool is only ever "connected" for the
      // exact Connection it was built from, and only while that
      // Connection is actually in the "connected" state — the same
      // contract every native ToolDefinition.isConnected() honors.
      isConnected: () => connection.status === "connected",
      notConnectedReason: connection.status !== "connected" ? `Test connector is ${connection.status}.` : undefined,
      actions: [
        {
          id: "echo",
          label: "Echo",
          permission: "read",
          riskLevel: "low",
          run: (input: unknown, ctx: ToolContext) => echoRun(input as EchoInput, ctx),
        },
      ],
    },
    {
      id: "connector_test.actions",
      name: "Test Connector — Actions",
      provider: "internal-test",
      description: "Internal, non-external test tool with one real write action — used only to validate the real permission/approval/resume/idempotency runtime mechanics without a real third-party account.",
      isConnected: () => connection.status === "connected",
      notConnectedReason: connection.status !== "connected" ? `Test connector is ${connection.status}.` : undefined,
      actions: [
        {
          id: "record",
          label: "Record test event",
          // write + medium risk: a real HIGH_RISK_PERMISSIONS action,
          // subject to the exact same server-side approval gate as a
          // real Salesforce/Slack write (lib/agent/tool-runner.ts).
          permission: "write",
          riskLevel: "medium",
          run: (input: unknown, ctx: ToolContext) => recordRun(connection, input as RecordInput, ctx),
        },
      ],
    },
  ]
}

export const testConnector: ConnectorDefinition = {
  id: "connector_test",
  name: "Internal Test Connector",
  description: "A non-external connector used only to validate the Connector Foundation (registry, connection lifecycle, Tool Registry integration, permission enforcement, approval/resume/idempotency). Never appears as a real integration to end users outside this validation.",
  provider: "internal",
  authenticationType: "none",
  capabilities: [
    { id: "test.echo", label: "Echo", description: "Echoes back the given message — real execution, no external call.", permission: "read" },
    { id: "test.record", label: "Record test event", description: "Writes one real, internal, org-scoped test record — no external call, never a real business result.", permission: "write" },
  ],
  enabled: true,
  buildTools: buildTestConnectorTools,
}

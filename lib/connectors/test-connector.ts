/* ================================================================== *
 * INTERNAL TEST CONNECTOR — proves the Connector Foundation end to
 * end without any real third-party account.
 *
 * Its one tool (`connector_test.echo`) is a real ToolDefinition —
 * real execution, real event emission, real permission enforcement —
 * it just talks to nothing external. This is what lets Phase 1 be
 * verified (register -> connect -> tool appears -> tool runs through
 * the real tool-runner/toolExecutionBoundary -> disconnect -> tool
 * disappears) without faking a Gmail/Sheets/Instagram connection that
 * doesn't actually exist yet.
 * ================================================================== */

import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import type { Connection, ConnectorDefinition } from "./types"

interface EchoInput {
  message: string
}

async function echoRun(input: EchoInput, _ctx: ToolContext): Promise<ToolActionResult<{ echoed: string }>> {
  const started = Date.now()
  return { ok: true, data: { echoed: input.message }, durationMs: Date.now() - started }
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
  ]
}

export const testConnector: ConnectorDefinition = {
  id: "connector_test",
  name: "Internal Test Connector",
  description: "A non-external connector used only to validate the Connector Foundation (registry, connection lifecycle, Tool Registry integration, permission enforcement). Never appears as a real integration to end users outside this validation.",
  provider: "internal",
  authenticationType: "none",
  capabilities: [{ id: "test.echo", label: "Echo", description: "Echoes back the given message — real execution, no external call.", permission: "read" }],
  enabled: true,
  buildTools: buildTestConnectorTools,
}

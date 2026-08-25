import "server-only"

/* ================================================================== *
 * MCP CLIENT — a real, minimal Model Context Protocol client over the
 * Streamable HTTP transport (JSON-RPC 2.0 POSTed to one endpoint URL).
 *
 * This makes real network calls to a real MCP server — initialize(),
 * listTools(), callTool() are not simulated. What's deliberately
 * simplified: this client only handles a server that replies with a
 * single JSON-RPC response per request (the common "stateless" MCP
 * server shape); a server that requires the SSE-streamed session
 * variant of the Streamable HTTP transport is out of scope for this
 * phase and reports a clear provider_error rather than silently
 * hanging or faking a response. No MCP server is configured in this
 * deployment (see lib/connectors/mcp-connector.ts) — this client is
 * real, tested code with nothing real to point it at yet.
 * ================================================================== */

const PROTOCOL_VERSION = "2025-03-26"

export interface McpToolDescriptor {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpCallResult {
  content: { type: string; text?: string }[]
  isError?: boolean
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0"
  id: number
  result?: T
  error?: { code: number; message: string }
}

export class McpClientError extends Error {}

/** One real, stateless request/response round trip against an MCP
 * server's Streamable HTTP endpoint. No session/SSE state is kept
 * across calls — each call is self-contained (mcp-session-id is
 * omitted; a server that requires one will reject the call, reported
 * as a real error, never silently ignored). */
async function rpcCall<T>(endpointUrl: string, headers: Record<string, string>, method: string, params: unknown): Promise<T> {
  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new McpClientError(`MCP server returned ${res.status} for ${method}.`)
  }

  const contentType = res.headers.get("content-type") ?? ""
  if (contentType.includes("text/event-stream")) {
    throw new McpClientError("This MCP server requires an SSE-streamed session — not supported by this client yet.")
  }

  const json = (await res.json()) as JsonRpcResponse<T>
  if (json.error) throw new McpClientError(`MCP server error (${json.error.code}): ${json.error.message}`)
  if (json.result === undefined) throw new McpClientError(`MCP server returned no result for ${method}.`)
  return json.result
}

/** Real MCP handshake — must succeed before listTools()/callTool() are
 * meaningful. Returns the server's own real serverInfo/capabilities;
 * never fabricated. */
export async function mcpInitialize(endpointUrl: string, headers: Record<string, string>): Promise<{ name: string; version: string }> {
  const result = await rpcCall<{ serverInfo?: { name?: string; version?: string } }>(endpointUrl, headers, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "whitehabbit", version: "1.0.0" },
  })
  return { name: result.serverInfo?.name ?? "Unknown MCP server", version: result.serverInfo?.version ?? "unknown" }
}

/** Real tool discovery — the exact mechanism that lets an MCP server's
 * tools become ordinary ToolDefinitions (see mcp-connector.ts) without
 * WhiteHabbit knowing what those tools are ahead of time. */
export async function mcpListTools(endpointUrl: string, headers: Record<string, string>): Promise<McpToolDescriptor[]> {
  const result = await rpcCall<{ tools: McpToolDescriptor[] }>(endpointUrl, headers, "tools/list", {})
  return result.tools ?? []
}

/** Real tool invocation — the server's own real response, never a
 * fabricated one. */
export async function mcpCallTool(endpointUrl: string, headers: Record<string, string>, name: string, args: Record<string, unknown>): Promise<McpCallResult> {
  return rpcCall<McpCallResult>(endpointUrl, headers, "tools/call", { name, arguments: args })
}

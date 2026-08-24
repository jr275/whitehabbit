import "server-only"

/* ================================================================== *
 * BROWSER / PAGE EXTRACTION TOOL — a real HTTP fetch + text extraction.
 *
 * open(url) really requests the page; extract(html) really strips it
 * to readable text. It will only succeed against hosts this
 * environment's egress policy allows (registry.npmjs.org, pypi.org,
 * etc.) — anything else fails with a real network error, which is
 * reported truthfully rather than papered over. In a normal
 * deployment (no egress allowlist), the exact same code reaches any
 * public URL.
 * ================================================================== */

import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"
import { assertSafeUrl } from "@/lib/security/ssrf-guard"

export interface OpenPageInput {
  url: string
}

export interface OpenPageOutput {
  url: string
  title: string
  text: string
  fetchedAt: number
}

function extractText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ""
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
  return { title, text: text.slice(0, 6000) }
}

export async function openPage(input: OpenPageInput): Promise<ToolActionResult<OpenPageOutput>> {
  const started = Date.now()
  try {
    // Real SSRF check before any request leaves the server — input.url
    // is Worker-configuration-controlled (Knowledge sources, and any
    // future user-supplied URL), so it must never be trusted to point
    // only at the public internet without verifying it does.
    const safeUrl = await assertSafeUrl(input.url)
    const res = await fetch(safeUrl, { signal: AbortSignal.timeout(15_000), headers: { accept: "text/html" }, redirect: "error" })
    if (!res.ok) {
      return { ok: false, error: `Fetching ${input.url} returned ${res.status}`, durationMs: Date.now() - started }
    }
    const html = await res.text()
    const { title, text } = extractText(html)
    return { ok: true, data: { url: input.url, title, text, fetchedAt: Date.now() }, durationMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Could not reach ${input.url}`,
      durationMs: Date.now() - started,
    }
  }
}

export const browserTool: ToolDefinition = {
  id: "tool_browser",
  name: "Browser",
  provider: "HTTP fetch",
  description: "Opens a real URL and extracts its page text for analysis.",
  isConnected: () => true,
  actions: [
    {
      id: "open",
      label: "Open page",
      permission: "read",
      riskLevel: "low",
      run: async (input: OpenPageInput) => openPage(input),
    },
  ],
}

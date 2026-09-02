import "server-only"

import { analyticsTool } from "./analytics"
import { browserTool } from "./browser"
import { googleTrendsTool } from "./google-trends"
import { llmTool } from "./llm"
import { marketingActionsTool } from "./marketing-actions"
import { newsTool } from "./news"
import { socialSignalsTool } from "./social-signals"
import { webSearchTool } from "./web-search"
import type { ToolDefinition } from "@/lib/agent/types"

export const TOOL_REGISTRY: ToolDefinition[] = [webSearchTool, browserTool, analyticsTool, llmTool, newsTool, googleTrendsTool, socialSignalsTool, marketingActionsTool]

export function getTool(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id)
}

export function toolsMap(): Map<string, ToolDefinition> {
  return new Map(TOOL_REGISTRY.map((t) => [t.id, t]))
}

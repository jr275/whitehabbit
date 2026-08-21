import "server-only"

/* Overwrites each tool's connected/notConnectedReason/provider with the
 * REAL, live status before a Worker is sent to the client — connection
 * status (and, for tool_llm, which provider is actually active) is a
 * fact about the environment right now, never a stored assumption from
 * whenever the worker was last saved. This is how the UI shows
 * "Gemini API key required" instead of a stale "Anthropic" the moment
 * LLM_PROVIDER changes, with no Studio code touched. */

import { liveToolStatus } from "@/lib/agent/tools/status"
import type { Worker } from "@/lib/workforce/model"

export function hydrateWorkerLiveState(worker: Worker): Worker {
  return {
    ...worker,
    tools: worker.tools.map((t) => {
      const status = liveToolStatus(t.id)
      return { ...t, connected: status.connected, notConnectedReason: status.reason, provider: status.provider }
    }),
  }
}

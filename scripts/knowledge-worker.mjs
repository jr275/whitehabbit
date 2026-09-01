#!/usr/bin/env node
/* ==================================================================
 * KNOWLEDGE WORKER — a separate process, not a web request.
 *
 * WHY THIS EXISTS. Milestone 1 drove the queue from inside the web
 * process, via after() on the save path and an internal /tick
 * endpoint. That worked, and it stays as a fallback, but it puts
 * ingestion and the user's page render in the same process: a burst of
 * saves competes with page loads for the same event loop, the same
 * connection pool and the same memory, and a document large enough to
 * be expensive to extract is felt by everyone browsing at that moment.
 *
 * M2 makes it worse on purpose — archiving reads and gzips multi-
 * megabyte buffers, re-extraction reads them back — so the separation
 * has to happen now rather than being deferred again.
 *
 * WHAT IS ACTUALLY SEPARATED:
 *
 *   web     serves requests. Still enqueues, and still calls
 *           drainInBackground() so a single-process deployment keeps
 *           working exactly as it does today.
 *   worker  this file. Long-running, claims jobs under the same
 *           compare-and-swap, and runs the same stage functions.
 *
 * They are safe to run TOGETHER: claiming is a compare-and-swap with
 * FOR UPDATE SKIP LOCKED, so a web process and any number of workers
 * split the queue rather than duplicating it. That is what makes this
 * a deployment choice rather than a migration — run the worker and the
 * web process stops doing the heavy lifting, without a code change.
 *
 * NO NEW DEPENDENCY. Node's own type stripping runs the TypeScript
 * directly, exactly as the test suite does.
 *
 *   node --experimental-strip-types scripts/knowledge-worker.mjs
 *
 * SHUTDOWN. SIGTERM stops the loop after the job in flight, so a
 * deploy does not strand work mid-fetch. If the process is killed
 * anyway, the reaper reclaims the job — which is why the worker is
 * allowed to be this simple.
 * ================================================================== */

import { register } from "node:module"
import { pathToFileURL } from "node:url"
import path from "node:path"

// Same alias resolution the app builds with, so "@/lib/..." works
// outside of Next's bundler.
register("./scripts/module-alias-hooks.mjs", pathToFileURL(path.join(process.cwd(), "/")))

const { drainQueue } = await import("../lib/knowledge/ingestion/runner.ts")
const { logger } = await import("../lib/platform/logger.ts")

/** How long to wait when the queue came back empty. Long enough not to
 * hammer the database, short enough that a save feels immediate — and
 * the save path's own drainInBackground() covers the common case
 * anyway, so this is the floor, not the latency. */
const IDLE_MS = Number(process.env.KNOWLEDGE_WORKER_IDLE_MS ?? 2_000)
/** After a pass that did work, come straight back for more. */
const BUSY_MS = 100
const BATCH = Number(process.env.KNOWLEDGE_WORKER_BATCH ?? 5)

let running = true
let inFlight = false

function stop(signal) {
  if (!running) return
  running = false
  logger.info("knowledge_worker_stopping", { signal, inFlight })
}

process.on("SIGTERM", () => stop("SIGTERM"))
process.on("SIGINT", () => stop("SIGINT"))

// A worker that dies on one bad job is worse than one that logs and
// continues; the reaper handles anything genuinely stuck.
process.on("unhandledRejection", (reason) => {
  logger.error("knowledge_worker_unhandled_rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
  })
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.() ?? setTimeout(resolve, ms))

logger.info("knowledge_worker_started", { pid: process.pid, batch: BATCH, idleMs: IDLE_MS })

while (running) {
  inFlight = true
  let didWork = false
  try {
    const result = await drainQueue({ maxJobs: BATCH, budgetMs: 45_000, reap: true })
    didWork = result.claimed > 0
    if (result.claimed > 0 || result.reaped.requeued > 0 || result.reaped.failed > 0 || result.collected > 0) {
      logger.info("knowledge_worker_pass", { ...result, reaped: undefined, ...result.reaped })
    }
  } catch (err) {
    // Almost always the database being briefly unavailable. Back off
    // to the idle interval and try again rather than exiting, so a
    // 30-second database blip does not need an orchestrator restart.
    logger.error("knowledge_worker_pass_failed", {
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    inFlight = false
  }

  if (!running) break
  await sleep(didWork ? BUSY_MS : IDLE_MS)
}

logger.info("knowledge_worker_stopped", { pid: process.pid })
process.exit(0)

import "server-only"

/* POST /api/pocket2/items — save a URL. Idempotent per workspace.
 * GET  /api/pocket2/items — the library, filtered and cursor-paged.
 *
 * Both derive their organization from the verified session via
 * requireTenant(); neither accepts an org id from the request. */

import { after, NextResponse } from "next/server"
import { withApiHandler, ValidationError } from "@/lib/api-error"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireTenant } from "@/lib/pocket2/tenancy"
import { parseLibraryQuery, requireString } from "@/lib/pocket2/domain/validate"
import { getLibraryPage } from "@/lib/pocket2/services/library-service"
import { saveUrl } from "@/lib/pocket2/services/save-service"
import { recordAudit } from "@/lib/db/repo"
import { logger } from "@/lib/observability/logger"
import { runIngestTick } from "@/lib/pocket2/ingest/worker"

export async function GET(req: Request) {
  return withApiHandler("pocket2.items.list", async () => {
    const ctx = await requireTenant()
    const page = await getLibraryPage(ctx, parseLibraryQuery(new URL(req.url).searchParams))
    return NextResponse.json(page)
  })
}

export async function POST(req: Request) {
  return withApiHandler("pocket2.items.save", async () => {
    const ctx = await requireTenant()
    // Per workspace, not per user: the limit protects the ingestion
    // queue and the sites it fetches, which are shared resources.
    await enforceRateLimit("pocket2_save", ctx.orgId)

    const body = (await req.json().catch(() => null)) as { url?: unknown; title?: unknown } | null
    if (!body) throw new ValidationError("Send a JSON body with a url.")

    const url = requireString(body.url, "url", { max: 2048 })
    const title = body.title === undefined || body.title === null ? undefined : requireString(body.title, "title", { max: 300 })

    const { item, duplicate } = await saveUrl(ctx, url, title)
    await recordAudit({
      orgId: ctx.orgId, userId: ctx.userId,
      action: duplicate ? "pocket2.item.save_duplicate" : "pocket2.item.save",
      resourceType: "saved_item", resourceId: item.id,
      metadata: { domain: item.domain },
    })

    if (!duplicate) {
      /* Start ingesting as soon as the response is on its way.
       *
       * after() runs the callback once the response is finished, so
       * the person who pasted the link is never waiting on someone
       * else's web server — but their card still fills in within a
       * second or two instead of on the next cron tick.
       *
       * This is an ACCELERATOR, not the mechanism. The platform may
       * cut the invocation short, so /api/pocket2/jobs/tick on a
       * schedule remains what guarantees the queue drains; a job
       * already claimed here is simply skipped there. Failures are
       * swallowed deliberately: the save itself already succeeded and
       * must not be reported as failed because a background fetch was
       * cut off. */
      after(async () => {
        try {
          await runIngestTick(1)
        } catch (error) {
          logger.warn("pocket2_inline_tick_failed", {
            itemId: item.id,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })
    }

    // 200 for a duplicate, 201 for a genuinely new row — the status
    // code tells the truth about whether anything was created.
    return NextResponse.json({ item, duplicate }, { status: duplicate ? 200 : 201 })
  })
}

/* ------------------------------------------------------------------ *
 * /outputs — the deliverables surface. The concrete things the worker
 * has produced: qualified leads, drafted messages, booked meetings,
 * CRM writes, contracts, reports. Each artifact is readable and carries
 * its provenance. This is the reason the worker exists.
 * ------------------------------------------------------------------ */

import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { OutputsBrowser } from "@/components/studio/outputs-browser"
import { Tag } from "@/components/studio/primitives"
import { StudioShell } from "@/components/studio/studio-shell"
import { OUTPUT_TOTALS, OUTPUT_TYPE_META } from "@/lib/studio-data"

export default function OutputsPage() {
  return (
    <StudioShell>
      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        {/* header */}
        <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
                Outputs
              </h1>
              <Tag tone="primary">Delivered</Tag>
            </div>
            <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
              Everything Atlas has produced — readable artifacts, each with
              the capability chain that made it. This is the work, not the
              worker.
            </p>
          </div>
          <Link
            href="/studio"
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary sm:self-auto"
          >
            Open Studio
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* lifetime totals */}
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
          {OUTPUT_TOTALS.map((t) => (
            <div key={t.type} className="bg-card p-4">
              <div className="font-mono text-[22px] font-medium tabular-nums tracking-tight text-foreground">
                {t.value}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {OUTPUT_TYPE_META[t.type].plural}
              </div>
            </div>
          ))}
        </div>

        {/* recent ledger + preview */}
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
              Recent artifacts
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              last 6 hours
            </span>
          </div>
          <OutputsBrowser />
        </div>
      </div>
    </StudioShell>
  )
}

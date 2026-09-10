import Link from "next/link"
import { ArrowLeft, type LucideIcon } from "lucide-react"
import { PageContainer, PageHeader } from "./page-header"

interface ComingSoonProps {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  /** What this surface will do once its backing service is real. */
  bullets?: string[]
}

/**
 * An honest placeholder for surfaces whose backing service does not exist
 * yet (audio synthesis, retrieval-augmented Q&A, research synthesis,
 * hand-curated collections). We deliberately show NO fabricated data —
 * just a clear description of what's coming and a route back to the real
 * Library.
 */
export function ComingSoon({ eyebrow, title, description, icon: Icon, bullets }: ComingSoonProps) {
  return (
    <PageContainer>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={description} />

      <div className="mt-10 flex flex-col items-center gap-6 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--kn-ai)]/12 text-[var(--kn-ai)]">
          <Icon className="size-7" />
        </span>
        <div className="flex max-w-md flex-col items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kn-ai)]/30 bg-[var(--kn-ai)]/10 px-3 py-1 text-[12px] font-medium text-[var(--kn-ai)]">
            Coming soon
          </span>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            This surface is designed but not wired to a real service yet, so there&apos;s nothing to show — we&apos;d
            rather leave it honest than fill it with fake data.
          </p>
        </div>

        {bullets && bullets.length > 0 ? (
          <ul className="mx-auto max-w-sm space-y-2 text-left">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--kn-ai)]" />
                {b}
              </li>
            ))}
          </ul>
        ) : null}

        <Link
          href="/knowledge/library"
          className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="size-4" /> Back to your library
        </Link>
      </div>
    </PageContainer>
  )
}
